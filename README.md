knowhow-server
==============

This is the control application for the knowhow framework.  It acts as a manager for knowhow agents, repositories, jobs, and workflows.  Repositories, jobs and workflows may be created, edited and executed.  Knowhow-server uses socket.io and simple http calls to control agent execution and lifecyle across multiple servers.

This package is the server only.  For the complete package please use the [knowhow](https://github.com/jfelten/knowhow) project.

# Installation


    npm install knowhow-server

run directly from node:

    node server.js

    startKHServer if installed via the [knowhow](https://github.com/jfelten/knowhow)
    

    
After starting access the agent through a web browser  [http://localhost:3001](http://localhost:3001).

##Key Concepts

####[knowhow-agent](https://github.com/jfelten/knowhow-agent)

A knowhow agent is a simple web application that provides a control interface to execute knowhow jobs.  Knowhow-agents run as a specific user on a specific port(default 3000), and are coordinated by the knowhow-server.

####[knowhow-server](https://github.com/jfelten/knowhow-server)

Knowhow-server, this project, manages agents, jobs, workflows and repositories.  It is a web application accessed through the browser [http://localhost:3001](http://localhost:3001).

####[repository](https://github.com/jfelten/knowhow_example_repo)

A collection of json objects, and other dependent files that represent jobs, environments, and workflows.  Repositories are currently file based and is a directory with the following top folders: environments, jobs, workflows.  Each folder contains the specifc types of objects: ex jobs have job objects, environments define environment objects, and workflows defined workflow objects.  The may be other nested folder structures underneath one of the top 3 directories.  Eventually there will be database based repositories.  See [knowhow_example_repo](https://github.com/jfelten/knowhow_example_repo) for an example repository structure.

####[job](https://github.com/jfelten/knowhow-shell)

A knowhow job is a json object that represents a task or shell script.  Jobs contain a list of shell commands with reponses to specific text if necessary.  Jobs also define environment variables that can be referenced through the json object for easier automation.  See the [knowhow-shell](https://github.com/jfelten/knowhow-shell) project for how to use knowhow jobs directly from node.

####environment

An environment is a collection of hosts that run knowhow-agents.  Environments are referenced by workflow objects to coordinate across different hosts.

####workflow

A workflow is a directive of jobs or tasks that get run against an environment.

##Quickstart

After installing execute either: node <KHSERVER_INSTALL_DIR>server.js or startKHServer if installed via the [knowhow](https://github.com/jfelten/knowhow) project. Once running open a broswer to the server ex: [http://localhost:3001](http://localhost:3001).

###Step 1 - create a repository

Navigate to the repositories tab on the left of the top menu.  This should open the create repository subtab

![repositories](https://github.com/jfelten/knowhow-server/blob/master/docs/screenshots/repository.png)

Create a simple file repository by clicking the create new empty file repository.  This will create an empty repository in the directory where knowhow-server is running

###Step 2 - start a knowhow-agent running on http://localhost:3000

Navigate to the agents tab and and enter a login/password and host(localhost) click Add Agent.  The agent icon will turn green if successful.
![repositories](https://github.com/jfelten/knowhow-server/blob/master/docs/screenshots/addAgent.png)
