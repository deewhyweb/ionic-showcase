import { Injectable } from '@angular/core';
import {
  ADD_TASK,
  DELETE_TASK,
  GET_TASKS,
  UPDATE_TASK
} from './graphql.queries';
import { AllTasks, Task } from './types';
import { VoyagerService } from './voyager.service';
import {
  ApolloOfflineClient,
  CacheOperation,
  subscribeToMoreHelper,
  ApolloOfflineStore
} from 'offix-client-boost';
import { subscriptionOptions } from './cache.updates';
import { NetworkService } from '../../services/network.service';
import { ConstantPool } from '@angular/compiler';

@Injectable({
  providedIn: 'root'
})
export class ItemService {

  private readonly apollo: ApolloOfflineClient;
  private offlineStore: ApolloOfflineStore;
  

  constructor(aeroGear: VoyagerService, public networkService: NetworkService) {
    this.apollo = aeroGear.apolloClient;
    this.offlineStore = aeroGear.offlineStore;
    this.networkService.networkInterface.onStatusChangeListener({
      onStatusChange: async (networkInfo) => {
        console.log(`Item service, Network Online: ${networkInfo.online}`);
        if (networkInfo.online === true) {
          
          await this.getItems();
        }
      }
    });
  }

  /**
   * Force cache refresh to get recent data
   */
  refreshItems() {
    // Force cache refresh by performing network
    console.log('Doing refresh');
    return this.apollo.query<AllTasks>({
      query: GET_TASKS,
      fetchPolicy: 'network-only',
      errorPolicy: 'none'
    });
  }

  // Watch local cache for updates
  getItems() {
    const getTasks = this.apollo.watchQuery<AllTasks>({
      query: GET_TASKS,
      fetchPolicy: 'cache-first',
      errorPolicy: 'none'
    });
    subscribeToMoreHelper(getTasks, subscriptionOptions);
    return getTasks;
  }

  createItem(title, description) {
    return this.apollo.offlineMutate<Task>({
        mutation: ADD_TASK,
        variables: {
          'title': title,
          'description': description,
          'version': 1,
          'status': 'OPEN'
        },
        updateQuery: GET_TASKS,
        returnType: 'Task'
      });
  }

  updateItem(item) {
    return this.apollo.offlineMutate<Task>({
        mutation: UPDATE_TASK,
        variables: item,
        updateQuery: GET_TASKS,
        returnType: 'Task',
        operationType: CacheOperation.REFRESH
      }
    );
  }

  deleteItem(item) {
    return this.apollo.offlineMutate<Task>({
        mutation: DELETE_TASK,
        variables: item,
        updateQuery: GET_TASKS,
        returnType: 'Task',
        operationType: CacheOperation.DELETE
      }
    );
  }

  getOfflineItems() {
    return this.offlineStore.getOfflineData();
  }

  getClient() {
    return this.apollo;
  }
}
