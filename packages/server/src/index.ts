import { ApolloServer } from "apollo-server-express";
import { ApolloServerPluginDrainHttpServer } from "apollo-server-core";
import express from "express";
import http from "http";
import serverless from "serverless-http";
import type * as winston from "winston";
import {
  ApolloServerErrorCode,
  unwrapResolverError,
} from "@apollo/server/errors";
import { typeDefs, resolvers, type AppContext } from "@delivery-tracker/api";
import {
  DefaultCarrierRegistry,
  logger as coreLogger,
} from "@delivery-tracker/core";
import { initLogger } from "./logger";

const serverRootLogger: winston.Logger = coreLogger.rootLogger.child({
  module: "server",
});

const app = express();
const httpServer = http.createServer(app);

const server = new ApolloServer({
  typeDefs,
  resolvers: resolvers.resolvers,
  persistedQueries: false,
  formatError: (error) => {
    const extensions = error.extensions ?? {};
    switch (extensions.code) {
      case "INTERNAL":
      case "BAD_REQUEST":
      case "NOT_FOUND":
      case ApolloServerErrorCode.INTERNAL_SERVER_ERROR:
        extensions.code = "INTERNAL";
        break;
      case ApolloServerErrorCode.GRAPHQL_PARSE_FAILED:
        extensions.code = "BAD_REQUEST";
        break;
      case ApolloServerErrorCode.GRAPHQL_VALIDATION_FAILED:
        extensions.code = "BAD_REQUEST";
        break;
      case ApolloServerErrorCode.PERSISTED_QUERY_NOT_FOUND:
        extensions.code = "BAD_REQUEST";
        break;
      case ApolloServerErrorCode.PERSISTED_QUERY_NOT_SUPPORTED:
        extensions.code = "BAD_REQUEST";
        break;
      case ApolloServerErrorCode.BAD_USER_INPUT:
        extensions.code = "BAD_REQUEST";
        break;
      case ApolloServerErrorCode.OPERATION_RESOLUTION_FAILURE:
        extensions.code = "BAD_REQUEST";
        break;
      default:
        extensions.code = "INTERNAL";
        break;
    }

    if (extensions.code === "INTERNAL") {
      serverRootLogger.error("internal error response", {
        error,
        errorMessage: unwrapResolverError(error),
      });
    }

    return {
      ...error,
      extensions,
      message:
        extensions.code === "INTERNAL" ? "Internal error" : error.message,
    };
  },
  context: async () => {
    const carrierRegistry = new DefaultCarrierRegistry();
    await carrierRegistry.init();
    const appContext: AppContext = {
      carrierRegistry,
    };
    return { appContext };
  },
  plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
});

app.get("/health", (req, res) => {
  res.send("OK");
});

initLogger();
const main = async () => {
  await server.start();
  server.applyMiddleware({ app });
  await new Promise<void>((resolve) =>
    httpServer.listen({ port: 4000 }, resolve)
  );
  console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`);
};
main();
