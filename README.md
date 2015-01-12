knowhow-server
==============

This is the control application for the knowhow framework.  It acts as a manager for knowhow agents, repositories, jobs, and workflows.  Repositories, jobs and workflows may be created, edited and executed.  Knowhow-server uses socket.io and simple http calls to control agent execution and lifecyle across multiple servers.

This package is the server only.  For the complete package please use the knowhow project.

# Installation


    npm install knowhow-server

run directly from node:

    node server.js



    startKHServer
    

    
After starting access the agent through a web browser  [http://localhost:3001](http://localhost:3001).

#Key Concepts

Before going further it is necessary to explain what an agent, a repository, a job, and a workflow are.

##Agent

A knowhow agent is a simple web application that provides a way to
