#!/usr/bin/env node

/* logging module */

log = require('loglevel');

/* required modules */

var fs     = require('fs');
var md5    = require('md5-file');
var diff   = require('prettydiff');
var spawn  = require ('child_process').spawn;
var redis  = require('redis');
var async  = require('async');
var moment = require('moment-timezone');

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
CURR_BKUP_DIR = BKUP_DIR;

const tmp_sign   = '/tmp/sign.sha256';
const public_key = '/etc/ssl/certs/' + BASE_MODULE  + '-Geteway' + 'Public.pem';

BASE_URL = 'build.' + BASE_MODULE + '.in/' + BASE_MODULE + '-geteway/';

SYS_DELAY = 5000;
EXIT_TIMEOUT = 10000;

var fileUrl;
var fileName;
var swVersion;
var filePath;

var activeVersionn;
var upgradeVersion;
var hwVersion;

// set log level as debug

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

   log.debug('Redis Connected');

   // pass on current version and next version
   setTimeout(function() {

     activeVersionn = process.argv[2];
     upgradeVersion = process.argv[3];
     hwVersion = process.argv[4];

     svcPkgDownloadStart();

   }, SYS_DELAY);

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

var execCmd1 = function(cmd, options, args1, working_dir, cb_error, cb_next)
{
    var retCode = 0;

    var child = spawn(cmd, [options, args1],
                 { cwd : working_dir } ), me = this;

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

          log.debug ('Err:(' + retCode + ') ' + cmd + ' ' + options + ' ' + args1);
          setTimeout(cb_error, SYS_DELAY);

       } else {

          log.debug ('End: ' + cmd + ' ' + options + ' ' + args1);
          setTimeout(cb_next, SYS_DELAY);

       }
    });
}

var execCmd2 = function(cmd, options, args0, args1, working_dir, cb_error, cb_next)
{
    var retCode = 0;

    var child = spawn(cmd, [options, args0, args1],
           { cwd : working_dir } ), me = this;

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
          log.debug('ERR:' + me.stderr);
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
       {if (code) {retCode = code;} });

    child.on('close', function (code) {

       if (code) {retCode = code;}

       if (retCode) {

          log.debug ('Err:(' + retCode + ') '+ cmd + ' ' +
                      options + ' ' +args0 + ' ' + args1);
          setTimeout(cb_error, SYS_DELAY);

       } else {

          log.debug ('End: ' + cmd + ' ' + args0 + ' ' + args1);
          setTimeout(cb_next, SYS_DELAY);
       }
    });
}

// command functions

var mkDirCmd = function (dir, cb_error, cb_next)
{
   var cmd = execCmd1('mkdir', '-p', dir, BASE_DIR,

      // on error
      function () {
         cb_error();
      },

      // on end
      function () {
         cb_next();
      }
   );
}

var rmCmd = function (file_name, cb_error, cb_next)
{
   var cmd = execCmd2('sudo', 'rm', '-rf', file_name, BASE_DIR,

      // on error
      function () {
         cb_error();
      },

      // on end
      function () {
         cb_next();
      }
   );
}

var rmDirCmd = function (dir, cb_error, cb_next)
{
   var cmd = execCmd1('rm', '-rf', dir, BASE_DIR,

      // on error
      function () {
         cb_error();
      },

      // on end
      function () {
         cb_next();
      }
   );
}

var sslValidateCmd = function (file_name, working_dir, cb_error, cb_next)
{
   var cmd = 'openssl';
   retCode = 0;

   log.debug ('Cmd: ssl validate (' + file_name + ')');

   var child = spawn('openssl', ['dgst', '-sha256', '-verify',
         public_key, '-signature', tmp_sign, file_name],
         { cwd : working_dir } ), me = this;

   child.stderr.on('data', function (data) {

      data += ' ';
      me.stderr = data.toString();
      log.debug(cmd + ': stderr:' + me.stderr);
   });

   child.stdout.on('data', function (data) {

      data += ' ';
      me.stdout = data.toString();
      log.debug(cmd + ': stdout:' + me.stdout);
   });

   child.stdout.on('end', function () {

      if (me.stdout) {
         publishMessage(me.stdout);
      }

      if (me.stderr) {
         log.debug(cmd + ': stderr:' + me.stderr);
      }
   });

   child.on('error', function (err) {

      if (me.stdout) {
         log.debug(cmd + ': stdout:' + me.stdout);
      }

      if (me.stderr) {
         log.debug(cmd + ': stderr:' + me.stderr);
      }
   });

   child.on('exit', function (code, signal)
         {if (code) {retCode = code;} });

   child.on('close', function (code) {

      if (code) {retCode = code;}

      if (retCode) {

         log.debug ('Err:('+retCode + ') '+ cmd);
         setTimeout(cb_error, SYS_DELAY);
      } else {

         log.debug ('End: ' + cmd );
         setTimeout(cb_next, SYS_DELAY);
      }
   });
}

var sslDigestCmd = function (digest, working_dir, cb_error, cb_next)
{
   var cmd = 'openssl';
   retCode = 0;

   log.debug ('Cmd: ssl prepare digest(' + digest + ')');

   var child = spawn('openssl', ['base64', '-d', '-in', digest, '-out', tmp_sign],
         { cwd : working_dir } ), me = this;

   child.stderr.on('data', function (data) {

      data += ' ';
      me.stderr = data.toString();
      //log.debug(cmd + ': stderr:' + me.stderr);
   });

   child.stdout.on('data', function (data) {

      data += ' ';
      me.stdout = data.toString();
      log.debug(cmd + ': stdout:' + me.stdout);
   });

   child.stdout.on('end', function () {

      if (me.stdout) {
         publishMessage(me.stdout);
      }

      if (me.stderr) {
         log.debug(cmd + ': stderr:' + me.stderr);
      }
   });

   child.on('error', function (err) {

      if (me.stdout) {
         log.debug(cmd + ': stdout:' + me.stdout);
      }

      if (me.stderr) {
         log.debug(cmd + ': stderr:' + me.stderr);
      }
   });

   child.on('exit', function (code, signal)
         {if (code) {retCode = code;} });

   child.on('close', function (code) {

      if (code) {retCode = code;}

      if (retCode) {

         log.debug ('Err:('+retCode + ') '+ cmd);
         setTimeout(cb_error, SYS_DELAY);
      } else {

         log.debug ('End: ' + cmd );
         setTimeout(cb_next, SYS_DELAY);
      }
   });
}

var tarCmd = function(options, file_name, working_dir, cb_error, cb_next)
{
   log.debug ('Cmd:  tar ' + options + ' ' + fileUrl);

   var cmd = new execCmd1('tar', options, file_name, working_dir,

      // on error
      function () {
         if (cb_error) {
            cb_error();
         }
      },

      // on end
      function () {
         if (cb_next) {
            cb_next();
         }
      }
   );
}

var wgetCmd = function (fileUrl, working_dir, cb_error, cb_next)
{
   log.debug ('Cmd:  wget ' + fileUrl);

   var cmd = execCmd2('wget', '--user=jenkins', '--password=welcome1',
                        fileUrl, working_dir,
      // on error
      function () {
         cb_error();
      },

      // on end
      function () {
         cb_next();
      }
   );
}

function cmdExit(status)
{
   log.debug('Executing exit command!');

   setTimeout(process.exit(status), SYS_DELAY);
}

var procOk = function()
{
   publishMessage ('package download successful');

   log.debug('package download successful');

   setTimeout(cmdExit(0), EXIT_TIMEOUT);
}

var procFail = function()
{
   publishMessage('package download unsuccessful');

   log.debug('package download unsuccessful');

   setTimeout(cmdExit(1), EXIT_TIMEOUT);
}

function bkupDirRemove()
{
   log.debug('deleting bkup directory ' + CURR_BKUP_DIR);

   rmDirCmd(CURR_BKUP_DIR, procOk, procOk);
}

var svcPkgValidate = function()
{
   var file_name = 'v' + upgradeVersion + '.tar.gz';

   publishMessage('validating package');

   log.debug('validating package signature' + file_name);

   // get the file from the build server
   sslValidateCmd(file_name, BKUP_DIR, procFail, bkupDirRemove);
}

var svcPkgDigestGet = function()
{
   var digest = 'v' + upgradeVersion + '.tar.gz.digest';

   publishMessage('preparing package signature');

   log.debug('preparing package signature: ' + fileName);

   // get the file from the build server
   sslDigestCmd(digest, BKUP_DIR, procFail, svcPkgValidate);
}

var svcPkgUncompress = function()
{
   publishMessage('uncompressing package');

   log.debug('untarring signed package:' + fileName);

   // get the file from the build server
   tarCmd('xvfz', fileName, BKUP_DIR,
      procFail, svcPkgDigestGet);
}

var svcPkgDownload = function()
{
   publishMessage('downloading package');

   log.debug('downloading :' + fileUrl);

   // get the file from the build server
   wgetCmd(fileUrl, BKUP_DIR, procFail, svcPkgUncompress);
}

var bkupDirCleanAndCreate = function()
{
   log.debug('cleaning files:' + filePath);

   // clean tar files, if any
   rmCmd(filePath, svcPkgDownload, svcPkgDownload);
}

var rootBkupDirCreate = function()
{
   log.debug('creating root bkup directory');

   // create backup directory
   mkDirCmd(BKUP_DIR, bkupDirCleanAndCreate, bkupDirCleanAndCreate);
}

var svcPkgDownloadStart = function()
{
   // validate the values to be proper
   if (!upgradeVersion || !activeVersionn || !hwVersion) {

      publishMessage(activeVersionn + ' ' + upgradeVersion +
         ' ' + hwVersion + ': upgrade failed');
      setTimeout(procFail, SYS_DELAY);
      return;
   }

   fileName = 'v' + upgradeVersion + '.tar.gz.signed';
   fileUrl  = BASE_URL + hwVersion + '/v' + upgradeVersion + '/' + fileName;
   filePath = BKUP_DIR + fileName;

   log.debug('current_version:' + activeVersionn + ' upgradeVersion: ' +
       upgradeVersion + ' hwVersion:' + hwVersion);

   // bkup current working version, here
   CURR_BKUP_DIR = BKUP_DIR + 'v' + activeVersionn;

   log.debug('Upgrade to ' + fileName);
   log.debug('BACKUP DIRECTORY:' + CURR_BKUP_DIR);

   rootBkupDirCreate();
}
