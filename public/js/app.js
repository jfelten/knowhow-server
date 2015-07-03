'use strict';

// Declare app level module which depends on filters, and services
angular.module('myModule', ['ui.bootstrap']);

angular.module('myApp', [               
  'myApp.controllers',
  'myApp.filters',
  'myApp.services',
  'myApp.directives',
  'ui.bootstrap',
  'ngRoute',
  'angularBootstrapNavTree',
  'qs_repository',
  'qs_workflow',
  'qs_agent',
  'angularFileUpload',
  'vtortola.ng-terminal'
]).
config(function ($routeProvider, $locationProvider) {
  $routeProvider.
  	when('/repositories', {
        templateUrl: 'partials/repositories',
        controller: 'RepositoriesController'
    }).
    when('/agents', {
      templateUrl: 'partials/agents',
      controller: 'AddAgentController'
    }).
    when('/jobs', {
      templateUrl: 'partials/jobs',
      controller: 'JobsController'
    }).
    when('/workflows', {
        templateUrl: 'partials/workflows',
        controller: 'WorkflowsController'
      }).
    when('/logs', {
          templateUrl: 'partials/logs',
          controller: 'LogsController'
        }).
    when('/about', {
          templateUrl: 'partials/about',
          controller: 'AppCtrl'
        }).
    otherwise({
      //redirectTo: '/agents'
    });

  $locationProvider.html5Mode(true);
});
