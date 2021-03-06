var http = require('http');
var urlParser = require("url");
var cluster = require("cluster");
var os = require("os");
const StringDecoder = require("string_decoder").StringDecoder;
let queryStringObject;


if (cluster.isMaster) {
  console.log(`Master process with PID ${process.pid} is running`);

  // Fork workers.
  for (let i = 0; i < os.cpus().length; i++) {
    cluster.fork();
  }

  for (const id in cluster.workers) {
    cluster.workers[id].on("message", msg => {
      console.log(
        `Worker id ${cluster.workers[id].process.pid} handling the request`
      );
    });
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
  });
} else {
  // Instantiate the HTTP server
  const httpServer = http
    .createServer((request, response) => {
      unifiedServer(request, response);
    })
    .listen(3000, () => {
      console.log(`The server is listening on port 3000. Worker with PID ${process.pid} has started
    `);
    });
}

var handler = {
  helloWorld: function(data,callback){
    callback(200, {message: "Welcome to my assignment!"});
  },
  notFound: function(data, callback){
    callback(404);
  },
};

var routes = {
  "hello":handler.helloWorld,
  notFound: handler.notFound
};

// All the server logic for both http
const unifiedServer = (request, response) => {
  // Get the URL and parse it
  const parsedURL = urlParser.parse(request.url, true);

  // Get the path
  const path = parsedURL.pathname;
  const trimmedPath = path.replace(/^\/+|\/+$/g, "");


  // Get the query string as an object
  queryStringObject = parsedURL.query;

  // Get the HTTP method
  const method = request.method.toLowerCase();

  // Get the Headers as an object
  const headers = request.headers;

  // Get the payload, if any
  const decoder = new StringDecoder("utf-8");
  let buffer = "";

  request.on("data", data => {
    buffer += decoder.write(data);
  });

  request.on("end", () => {
    buffer += decoder.end();

    // Choose the handler this request should go to, if one is not found, use the not found handler
    const chosenHandler =
      typeof routes[trimmedPath] !== "undefined"
        ? routes[trimmedPath]
        : routes.notFound;

    // Construct the data object to send to the handler
    const data = {
      trimmedPath,
      queryStringObject,
      method,
      headers,
      payload: buffer
    };

    // Route the request to the handler specify in the router
    chosenHandler(data, (statusCode, payload) => {
      // Use the status code called back by the handler, or default to 200
      statusCode = typeof statusCode === "number" ? statusCode : 200;

      // Use the payload called back by the handler or default to an empty object
      payload = typeof payload === "object" ? payload : {};

      // Convert the payload to a string
      const payloadString = JSON.stringify(payload);

      // Return the response
      response.setHeader("Content-Type", "application/json");
      response.writeHead(statusCode);

      // notify master about the request
      process.send({ cmd: "notifyRequest" });

      response.end(payloadString);
    });
  });
};
