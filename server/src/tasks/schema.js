const { pubSub } = require('../subscriptions')
const { conflictHandler } = require("@aerogear/voyager-conflicts")
const { TASK_ADDED, TASK_DELETED, TASK_UPDATED } = require("./subscriptions")

const typeDefs = `
type Task {
  id: ID!
  version: Int
  title: String!
  description: String!
  status: TaskStatus
}

enum TaskStatus {
  OPEN
  ASSIGNED
  COMPLETE
}

type Query {
  allTasks(first: Int, after: String): [Task],
  getTask(id: ID!): Task
}

type Mutation {
  createTask(title: String!, description: String!, status: TaskStatus): Task
  updateTask(id: ID!, title: String, description: String, version: Int!, status: TaskStatus): Task
  deleteTask(id: ID!): ID
}
`

const PUSH_ALIAS = 'cordova';

const taskResolvers = {
  Query: {
    allTasks: async (obj, args, context) => {
      const result = context.db.select().from('tasks')
      if (args.first && args.after) {
        result.limit(args.first)
        result.offset(args.after)
      } else if (args.first) {
        result.limit(args.first)
      }
      return result
    },
    getTask: async (obj, args, context, info) => {
      const result = await context.db.select().from('tasks').where('id', args.id).then((rows) => rows[0])
      return result
    }
  },

  Mutation: {
    createTask: async (obj, args, context, info) => {
      console.log("Create", args)
      const result = await context.db('tasks').insert({
        ...args,
        version: 1,
        status: 'OPEN'
      }).returning('*').then((rows) => rows[0])
      console.log("TASK CREATED", result)
      // TODO context helper for publishing subscriptions in SDK?
      // TODO move from passing pushClient in context and use boolean to push or not here
      publish(TASK_ADDED, result, context.pushClient)
      return result
    },
    updateTask: async (obj, clientData, context, info) => {
      console.log("Update from client", clientData)
      const task = await context.db('tasks').select()
        .where('id', clientData.id).then((rows) => rows[0])
      if (!task) {
        throw new Error(`Invalid ID for task object: ${clientData.id}`);
      }

      const conflictError = conflictHandler.checkForConflict(task, clientData);
      if(conflictError){
        throw conflictError;
      }

      const update = await context.db('tasks').update(clientData)
        .where({
          'id': clientData.id
        }).returning('*').then((rows) => rows[0])

      publish(TASK_UPDATED, update)
      return update;
    },
    deleteTask: async (obj, args, context, info) => {
      console.log("Delete", args)
      const result = await context.db('tasks').delete()
        .where('id', args.id).returning('*').then((rows) => {
          if (rows[0]) {
            const deletedId = rows[0].id
            publish(TASK_DELETED, rows[0])
            return deletedId;
          } else {
            throw new Error(`Cannot delete object ${args.id}`);
          }
        })
      return result
    }
  }
}

function publish(actionType, data, pushClient) {
  if (pushClient) {
    pushClient.sender.send({
      alert: `New task: ${data.title}`,
      userData: {
        title: data.title,
        message: actionType
      }
    },
      {
        criteria: {
          alias: [PUSH_ALIAS]
        }
      }).then((response) => {
        console.log("Notification sent, response received ", response);
      }).catch((error) => {
        console.log("Notification not sent, error received ", error)
      })
  }
  switch(actionType){
    case(TASK_ADDED):
      pubSub.publish(actionType, { taskAdded: data});
      break;
    case(TASK_DELETED):
      pubSub.publish(actionType, { taskDeleted: data});
      break;
    case(TASK_UPDATED):
      pubSub.publish(actionType, { taskUpdated: data});
      break;
  }
}

module.exports = {
  taskResolvers: taskResolvers,
  taskTypeDefs: typeDefs
}