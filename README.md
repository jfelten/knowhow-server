knowhow-server [![Build Status](https://travis-ci.org/jfelten/knowhow-server.svg)](https://travis-ci.org/jfelten/knowhow-server)
==============

This is the control application for the knowhow framework.  It acts as a manager for knowhow agents, repositories, jobs, and workflows.  Repositories, jobs and workflows may be created, edited and executed though the UI.  Knowhow-server uses socket.io and simple http calls to control agent execution and lifecyle across multiple servers.

This package is the server only.  For the complete package please use the [knowhow](https://github.com/jfelten/knowhow) project.

NOTE: This currently only works on Unix based systems.  Please create an issue if there is interest in running on windows.

### [Live knowhow-server Demo >>](http://knowhowjs.com:3001)

# Installation

    npm install knowhow-server

run directly from node:

    node index.js --port=<PORT_NUM> //default port is 3001 if not supplied

or from a node.js app

		require('knowhow-server/server.js')(3001, function(err) {
		
		}

or if installed via [knowhow](https://github.com/jfelten/knowhow):

    startKHServer --port=<PORT_NUM> //default port is 3001 if not supplied

    

After starting access the agent through a web browser  [http://localhost:3001](http://localhost:3001).

##Key Concepts

####[knowhow-agent](https://github.com/jfelten/knowhow-agent)

A knowhow agent is a simple web application that provides a control interface to execute knowhow jobs.  Knowhow-agents run as a specific user on a specific port(default 3000), and are coordinated by the knowhow-server.

####[knowhow-server](https://github.com/jfelten/knowhow-server)

Knowhow-server, this project, manages agents, jobs, workflows and repositories.  It is a web application accessed through the browser [http://localhost:3001](http://localhost:3001).

####[knowhow-api](https://github.com/jfelten/knowhow-api)

Knowhow-api provides a nodejs programming interface to a knowhow server.  It supports all functionality available via the knowhow server web GUI, and allows full automation of a knowhow server.  It also includes the command tool KHCommand, which allows any api command to be executed from a shell script to allow a knowhow server to be automated via shell scripts.

####[repository](https://github.com/jfelten/knowhow_example_repo)

A collection of json objects, and other dependent files that represent jobs, environments, and workflows.  Repositories are currently file based and is a directory with the following top folders: environments, jobs, workflows.  Each folder contains the specifc types of objects: jobs for job objects, environments environment json objects, and workflows for workflow objects.  The may be other nested folder structures underneath one of the top 3 directories.  Eventually there will be database based repositories.  See [knowhow_example_repo](https://github.com/jfelten/knowhow_example_repo) for an example repository structure.

####[job](https://github.com/jfelten/knowhow-shell)

A knowhow job is a json object that represents a task or shell script.  Jobs contain a list of shell commands with reponses to specific text if necessary.  Jobs also define environment variables that can be referenced through the json object for easier automation.  See the [knowhow-shell](https://github.com/jfelten/knowhow-shell) project for how to use knowhow jobs directly from node.

####environment

An environment is a collection of hosts that run knowhow-agents.  Environments are referenced by workflow objects to coordinate across different hosts.

####workflow

A workflow is a directive of jobs or tasks that get run against an environment.

##Quickstart

After installing execute either: node <KHSERVER_INSTALL_DIR>server.js or startKHServer if installed via the [knowhow](https://github.com/jfelten/knowhow) project. Once running open a broswer to the server ex: [http://localhost:3001](http://localhost:3001).

###Step 1 - create a repository

Navigate to the repositories tab on the left of the top menu.  This should open the new repository subtab.

![repositories](https://raw.githubusercontent.com/jfelten/knowhow-server/master/docs/screenshots/repository.png)

Create a simple file repository by clicking the create new empty file repository.  This will create an empty repository in the directory where knowhow-server is running

###Step 2 - start a knowhow-agent running on http://localhost:3000

Navigate to the agents tab and and enter a login/password and host(localhost) click Add Agent.  The agent icon will turn green if successful.
![addAgent](https://raw.githubusercontent.com/jfelten/knowhow-server/master/docs/screenshots/addAgent.png)

###Step 3 - create a simple "hello world" job and execute on the localhost agent

Navigate to the jobs page via the top menu and select MyRepo (or whatever name you chose) on the far left repository dropdown.  Expand the jobs tree by clicking the '+' symbol.  Now click the 'Add New File' button which will open a pop up.  Type "helloWorld.json" or other appropriate name in the text box.  Click the 'Create New File' button.  An empty file should appear in the left tree.  Select it and paste the following text in the edit pane:

    {
        "id": "hello world job",
        "working_dir": "./",
         "options": {
            "timeoutms": 360000
        },
        "files": [],
        "script": {
            "env": {
                "TEST_VAR": "hello",
                "TEST_VAR2": "world"
            },
            "commands": [
                {
                    "command": "echo $TEST_VAR $TEST_VAR2!"
                }
            ]
        }
    }

![helloWorldJob](https://raw.githubusercontent.com/jfelten/knowhow-server/master/docs/screenshots/helloWorldJob.png)

Now select the localhost agent from the agents dropdown above the edit pane.  Click Execute.  The will submit the hello world job to the agent and "echo "hello world!".  Congratulations now please put knowhow to work!

###More advanced examples - Adding an environment and workflow

Please see the [Docker example](https://github.com/jfelten/knowhow_example_repo/tree/master/jobs/docker) for a tutorial on how to use workflows to create and configure environments.

###[Real world examples](https://github.com/jfelten/knowhow_example_repo)

Please visit the [knowhow example repository project](https://github.com/jfelten/knowhow_example_repo) to see examples of actual production jobs.
