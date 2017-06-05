#!/usr/bin/env node

log = require('loglevel');

var fs    = require('fs');
var exec  = require('child_process').exec;
var spawn = require ('child_process').spawn;
var redis = require('redis');

BASE_MODULE  = 'securiot';
HOST_HOME    = '/home/Kat@ppa';

MGMT_SVC      = BASE_MODULE + '-mgmt';
MGMT_SVC_NAME = MGMT_SVC + '-service';
MGMT_SVC_PID  = MGMT_SVC + '-pid';
MGMT_SVC_MSG  = MGMT_SVC + '-upgrade-msg';

SVC_MODULE      = BASE_MODULE + '-upgrade';
SVC_MODULE_NAME = SVC_MODULE + '-service';
SVC_MODULE_PID  = SVC_MODULE + '-pid';
SVC_MODULE_MSG  = MGMT_SVC + '-msg';

BASE_DIR    = HOST_HOME + '/' + BASE_MODULE + '-gateway/';
BKUP_DIR    = HOST_HOME + '/' + BASE_MODULE + '-gateway.bkup/';
WORKING_DIR = BASE_DIR;
SYS_DELAY = 5000;

var activeVersion;
var upgradeVersion;
var hwVersion;
var updateStatus;
var redisUp = false;

var originalFactory = log.methodFactory;

log.methodFactory = function (methodName, logLevel, loggerName) {

   var rawMethod = originalFactory(methodName, logLevel, loggerName);

   return function (message) {

      rawMethod('['+ new Date() + ']' + SVC_MODULE_NAME + ': ' + message);
   };
};

// set log level as debug
log.setLevel('debug');

//Create Redis Client
redisClient = redis.createClient();

redisClient.on("connect", function() {

   redisUp = true;
   log.debug('Redis Connected');

   // pass on current version and next version
   setTimeout(function() {

      activeVersion  = process.argv[2];
      upgradeVersion = process.argv[3];
      hwVersion      = process.argv[4];
      updateStatus   = process.argv[5];

      pkgRestart(activeVersion, upgradeVersion);

     }, SYS_DELAY);
});

redisClient.on("error", function(error) {
   log.debug(error);
   redisUp = false;
});

/* send a sighup to server process */

var pushSighup = function (pid)
{
   try {

      process.kill(pid, 'SIGHUP');
   } catch (e) {

      log.debug ('send sighup fail ' + pid);
   }
}

var writeMessage = function(pid, message)
{

   redisClient.set(MGMT_SVC_MSG, message,

      function(err, reply) {

         if (err) {

            log.debug('status message send failed : '+ err);
            return;
         }

         pushSighup(pid);
      }
   );
}

/* write the message to redis database */
var publishMessage = function(message)
{
   redisClient.get(MGMT_SVC_PID,

      function(err, reply) {

         if (err) {
            log.debug('web-server get pid failed');
            return;
         }

         pid = reply;
         writeMessage(pid, message);
      }
   );
}
// command execution functions

var execCmd = function(cmd, options, working_dir, cb_error, cb_next)
{
    var retCode = 0;

    var child = spawn(cmd, [options], { cwd : working_dir } ), me = this;

    child.stderr.on('data', function (data) {

       data += ' ';
       me.stderr = data.toString();
    });

    child.stdout.on('data', function (data) {

       data += ' ';
       me.stdout = data.toString();
       log.debug(cmd + ': OUT:' + me.stdout);

    });

    child.stdout.on('end', function () {

       if (me.stdout) {
          publishMessage(me.stdout);
       }

       if (me.stderr) {
          log.debug(cmd + ': ERR:' + me.stderr);
       }

    });

    child.on('error', function (err) {

       if (me.stderr) {
          log.debug(cmd + ': ERR:' + me.stderr);
       }

       if (me.stdout) {
          log.debug(cmd + ': OUT:' + me.stdout);
       }

    });

    child.on('exit', function (code, signal)
          { if (code) {retCode = code;} });

    child.on('close', function (code) {

       if (code) {retCode = code;}

       if (retCode) {

          log.debug ('Err:(' + retCode + ') '+ cmd + ' ' + options);
          setTimeout(cb_error, SYS_DELAY);

       } else {

          log.debug ('End: ' + cmd + ' ' + options);
          setTimeout(cb_next, SYS_DELAY);
       }
    });
}

// command functions

var serviceCmd = function(service_name, operation, cb_error, cb_next)
{
   var cmd = execCmd('service', service_name, operation, WORKING_DIR,
       
       // on error
       function () {
          cb_error();
       },
       
       // on end
       // would not reach here, would be dead by now
       function () {
	  cb_next();
       }
    );
}

var rebootCmd = function()
{
   exec("reboot", null);
}

var procFail = function()
{
   log.debug('Executing exit command (1)!');
   setTimeout(process.exit(1), SYS_DELAY);
}

var procExit = function()
{
   log.debug('Executing exit command (0)!');

   setTimeout(process.exit(0), SYS_DELAY);
}

// main function block

var procEnd = function()
{
   log.debug('install successful');

   publish_status_message ('complete');

   setTimeout(procExit, SYS_DELAY);
}

var procErr = function()
{
   log.debug('install unsuccessful');

   publish_status_message('failed');

   setTimeout(procFail, SYS_DELAY);
}

var serviceRestart = function(module)
{
   log.debug('restart service: ' + module);

   // restart the service
   serviceCmd(module, 'restart', procEnd, procEnd);
}

var serviceStart = function(module)
{
   log.debug('start service: ' + module);

   // start the service
   serviceCmd(module, 'start', procEnd, procEnd);
}

var pkgRestart = function()
{
   // validate the values to be proper
   if (!upgradeVersion || !activeVersion || !hwVersion || !updateStatus) {

      publish_status_message(activeVersion + ' ' + upgradeVersion +
             ' ' + hwVersion + ': install failed');
      setTimeout(procErr, SYS_DELAY);

      return;
   }

   switch (updateStatus) {

   default:
   case 'serviceRestart':
      serviceRestart(MGMT_SVC_NAME);
      serviceRestart(HEALTH_SVC_NAME);
      serviceRestart(SVC_MODULE_NAME);
      break;

   // this will be called in the context of the install.js file, of the new package
   case 'systemRestart':
      log.debug('executing system reboot...');
      setTimeout(rebootCmd, SYS_DELAY);
      break;
   }
}
