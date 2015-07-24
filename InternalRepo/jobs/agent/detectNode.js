{
  "id": "install KH Agent",
  "working_dir": "/tmp/KHAgent",
  "options": {
    "timeoutms": 20000
  },
  "files": [],
  "shell": {
    "command": "ssh",
    "args": [
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "PreferredAuthentications=keyboard-interactive,password",
      "${USER}@${HOST}"
    ],
    "onConnect": {
      "timeoutms": 10000,
      "responses": {
        "[Pp]assword:": "${PASSWORD}"
      },
      "waitForPrompt": "[#$]",
      "errorConditions": [
        "timed out",
        "denied"
      ]
    },
    "onExit": {
      "command": "exit\r\n"
    }
  },
  "script": {
    "env": {
      "USER": "",
      "PASSWORD": "",
      "HOST": "",
      "AGENT_ID": "",
      "AGENT_DIR": "/tmp/${AGENT_ID}"
    },
    "commands": [
      {
        "command": "node -v"
      }
    ]
  }
}