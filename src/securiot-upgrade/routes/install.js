#!/usr/bin/env node

/* logging module */

log = require('loglevel');

/* required modules */

var fs     = require('fs');
var md5    = require('md5-file');
var diff   = require('prettydiff');
var exec   = require('child_process').exec;
var spawn  = require ('child_process').spawn;
var mqtt   = require('mqtt')
var async  = require('async');
var moment = require('moment-timezone');

var installSuccess = false;

BASE_MODULE  = 'securiot';
HOST_HOME    = '/home/Kat@ppa';

MGMT_SVC      = BASE_MODULE + '-mgmt';

SVC_MODULE      = BASE_MODULE + '-upgrade';
SVC_MODULE_NAME = SVC_MODULE + '-service';

BASE_DIR    = HOST_HOME + '/' + BASE_MODULE + '-gateway';
BKUP_DIR    = HOST_HOME + '/' + BASE_MODULE + '-gateway.bkup/';
WORKING_DIR = BASE_DIR;

KERNEL_FILE     = '/boot/kernel7.img';
NEW_KERNEL_FILE = WORKING_DIR + '/src/kernel/kernel7.img';

SERVICES_CONFIG_FILE  = WORKING_DIR + '/build/scripts/softwareUpgrade';
LIBRARIES_CONFIG_FILE = WORKING_DIR + '/build/scripts/libraryUpgrade';

KERNEL_CONFIG_FILE      = '/boot/config.txt';
NEW_KERNEL_CONFIG_FILE  = WORKING_DIR + '/src/kernel/config.txt';

KERNEL_CMDLINE_FILE     = '/boot/cmdline.txt';
NEW_KERNEL_CMDLINE_FILE = WORKING_DIR + '/src/kernel/cmdline.txt';

ETC_DIR        = '/etc';
ETC_CONFIG_DIR = WORKING_DIR + '/tools/sysconfig/';

LOC_LIB_DIR        = '/user/local/lib';
SELF_LIB_DIR       = WORKING_DIR + '/src/pkg/';
THIRDPARTY_LIB_DIR = WORKING_DIR + '/thirdparty/pkg/';

CURR_BKUP_DIR   = BKUP_DIR;
NEW_WORKING_DIR = BKUP_DIR;

SYS_DELAY  = 10000;
EXIT_DELAY = 10000;
MV_DELAY   = 30000;

var fileUrl;
var fileName;
var swVersion;
var filePath;

var activeVersion;
var upgradeVersion;
var hwVersion;
var updateState;

/* prepend timestamp  */

var originalFactory = log.methodFactory;

log.methodFactory = function (methodName, logLevel, loggerName) {

   var rawMethod = originalFactory(methodName, logLevel, loggerName);

   return function (message) {

      rawMethod('['+ new Date() + ']' + SVC_MODULE_NAME + ': ' + message);
   };
};

// set log level as debug
log.setLevel('debug');

//Create MQTT Client
mqttClient  = mqtt.connect('mqtt://localhost')

mqttClient.on('connect', function () {
	log.debug('Local MQTT Client connected');

	setTimeout(function() {

		activeVersion = process.argv[2];
		upgradeVersion = process.argv[3];
		hwVersion = process.argv[4];
		updateState = process.argv[5];

		pkgInstall(activeVersion, upgradeVersion);

	}, SYS_DELAY);
}

/* Publish Upgrade status message to internal MQTT topic */
var publishMessage = function(status, message)
{
	var upgradeStatus = {};
	upgradeStatus.status = status;
	upgradeStatus.msg = message;

	mqttClient.publish ('topic/system/config/softwareUpgrade/update', JSON.stringify(upgradeStatus));
}

// command execution functions

var execCmd0 = function(cmd, working_dir, cb_error, cb_next)
{
    var retCode = 0;

    var child = spawn(cmd, { cwd : working_dir } ), me = this;

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

          log.debug ('Err:(' + retCode + ') '+ cmd );
          setTimeout(cb_error, SYS_DELAY);

       } else {

          log.debug ('End: ' + cmd );
          setTimeout(cb_next, SYS_DELAY);
       }
    });
}

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

       var delay = SYS_DELAY;

       if (cmd == 'mv') {
           delay = MV_DELAY;
       }

       if (retCode) {

          log.debug ('Err:(' + retCode + ') ' + cmd + ' ' + options + ' ' + args1);
          setTimeout(cb_error, delay);

       } else {

          log.debug ('End: ' + cmd + ' ' + options + ' ' + args1);
          setTimeout(cb_next, delay);

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

var copyCmd = function (file1, file2, cb_error, cb_next, callback)
{
   var cmd = execCmd1('cp', file1, file2, BASE_DIR,

       // on error
       function () {

          if (cb_error) {
             cb_error();
          }
          if (callback) {
             callback();
          }
       },

       // on end
       function () {

          if (cb_next) {
             cb_next();
          }
          if (callback) {
             callback();
          }
       }
    );
}

var copyDirCmd = function (donor_dir, receiver_dir, cb_error, cb_next, callback)
{
   var cmd = execCmd2('cp', '-r', donor_dir, receiver_dir, BASE_DIR,

       // on error
       function () {

          if (cb_error) {
             cb_error();
          }
          if (callback) {
             callback();
          }
       },

       // on end
       function () {

          if (cb_next) {
             cb_next();
          }
          if (callback) {
             callback();
          }
       }
    );
}

var mkDirCmd = function (dir, cb_error, cb_next, callback)
{
   var cmd = execCmd1('mkdir', '-p', dir, BASE_DIR,

       // on error
       function () {
          if (cb_error) {
             cb_error();
          }
          if (callback) {
             callback();
          }
       },

       // on end
       function () {
          if (cb_next) {
             cb_next();
          }
          if (callback) {
             callback();
          }
       }
    );
}

var rmCmd = function(file_name, cb_error, cb_next)
{
   var cmd = execCmd1('rm', '-rf', file_name, BASE_DIR,

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

var syncCmd = function (cb_error, cb_next)
{
   var cmd = execCmd('sudo', 'sync', BASE_DIR,

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

var moveCmd = function (dir0, dir1, cb_error, cb_next)
{
   log.debug('mv ' + dir0 + ' ' + dir1);

   var cmd = execCmd1('mv', dir0, dir1, BASE_DIR,

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

var tarCmd = function(options, file_name, working_dir, cb_error, cb_next)
{
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

var serviceCmd = function(service_name, operation, cb_error, cb_next)
{
   // the web-server service operations
   var cmd = execCmd1('service', service_name, operation, WORKING_DIR,

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

var iptablesCmd = function(operation, cb_error, cb_next)
{
   // the web-server service operations
   var cmd = execCmd1('sudo', 'iptables', '-F', WORKING_DIR,

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

var runScript = function(script_name, cb_error, cb_next, callback)
{
   // the web-server service operations
   var cmd = execCmd('/bin/sh', script_name, WORKING_DIR,

       // on error
       function () {

          if (cb_error) {
             cb_error();
          }
          if (callback) {
             callback();
          }
       },

       // on end
       function () {

          if (cb_next) {
             cb_next();
          }
          if (callback) {
             callback();
          }
       }
    );
}

var errDone = function()
{
   log.debug('Executing exit command (1)!');
   setTimeout(process.exit(1), SYS_DELAY);
}

var exitCmd = function()
{
   log.debug('Executing exit command (0)!');

   setTimeout(process.exit(0), SYS_DELAY);
}

// main function block

var procDone = function()
{
   log.debug(updateState + ' installation complete');

   publishMessage(updateState + ' installation complete');

   setTimeout(exitCmd, EXIT_DELAY);
}

var procErr = function()
{
   log.debug(updateState + ' installation fail');

   publishMessage(updateState + ' installation fail');

   setTimeout(errDone, EXIT_DELAY);
}

var newWorkingDirDelete = function()
{
   log.debug(updateState + ': deleting ' + NEW_WORKING_DIR);

   rmCmd(NEW_WORKING_DIR, procErr, procErr);
}

var webSvcInstallErr = function()
{
   log.debug(updateState + ': untar command fail');

   publishMessage(updateState + ': untar command fail');

   rmCmd(filePath, newWorkingDirDelete, newWorkingDirDelete);
}

var webSvcRestart = function()
{
   log.debug('restart service ' + MGMT_SVC);

   // restart the service
   serviceCmd(MGMT_SVC, 'restart', procDone, procDone);
}

var otherSvcsRestart = function(callback)
{
   log.debug('restart service ' + MGMT_SVC);

   // restart the service
   serviceCmd('securiot-gpio', 'restart', callback, callback);
}

var webSvcStart = function()
{
   log.debug('start service ' + MGMT_SVC);

   // start the service
   serviceCmd(MGMT_SVC, 'start', procDone, procDone);
}

var diagSvcStop = function()
{
   log.debug('restart service ' + 'securiot-health');

   // restart the service
   serviceCmd('secureiot-health', 'stop', procDone, procDone);
}

var newWorkingDirMove = function()
{
   var cmd = 'sudo mv ' +  NEW_WORKING_DIR + ' ' + WORKING_DIR;
   log.debug(cmd);

   exec(cmd, function(err, stdout, stderr) {
      webSvcStart();
   });

   // now the tricky work, move the new version to working
/*
   moveCmd(NEW_WORKING_DIR, WORKING_DIR, webSvcStart,
        webSvcStart);
*/
}

var fileSystemSync = function()
{
   var cmd = 'sync;sleep 10;sync';

   log.debug('sync:' );

   //syncCmd(newWorkingDirMove, newWorkingDirMove);
   exec(cmd, function(err, stdout, stderr) {
      newWorkingDirMove();
   });

}

var webSvcStop = function()
{
   log.debug('stop service ' + MGMT_SVC);

   publishMessage('gateway installation complete');

   // now the tricky work, move the new version to working
   serviceCmd(MGMT_SVC, 'stop', fileSystemSync, fileSystemSync);
}

var workingDirMove = function()
{
   log.debug('move ' + WORKING_DIR + ' ' + CURR_BKUP_DIR);

   // now the tricky work, backup the working version
   moveCmd(WORKING_DIR, CURR_BKUP_DIR, webSvcStop, webSvcStop); 
}

var webSvcPkgDelete = function()
{
   log.debug('deleting ' + filePath);

   publishMessage('web service package updated, restarting');

   // delete web_service pkg file
   //rmCmd(filePath, webSvcInstallErr, webSvcStop);
   rmCmd(filePath, webSvcInstallErr, workingDirMove);
}

var webSvcPkgInstall = function()
{
   log.debug('Installing ' + filePath + ' ' + NEW_WORKING_DIR);

   publishMessage('installing package :' + filePath);

   // unpackage and install the code in the working directory
   tarCmd('xfz', filePath, NEW_WORKING_DIR,
          webSvcInstallErr, webSvcPkgDelete);
}

var workingDirCreate = function()
{
   publishMessage('creating new working dir :' + NEW_WORKING_DIR);

   // create new working directory
   mkDirCmd(NEW_WORKING_DIR, webSvcPkgInstall, webSvcPkgInstall);
}

var currBkupDirDelete = function()
{
   publishMessage('cleaning any old bkupdir dir :' + CURR_BKUP_DIR);

   // remove the working directory
   rmCmd(CURR_BKUP_DIR, workingDirCreate, workingDirCreate);
}

var bkupDirDelete = function()
{
   publishMessage('cleaning any old working dir :' + NEW_WORKING_DIR);

   // remove the working directory
   rmCmd(NEW_WORKING_DIR, currBkupDirDelete, currBkupDirDelete);
}

var procOk = function(callback)
{
   if (updateState) {
      log.debug(updateState + ': installation successful');
   } else {
      log.debug(': installation successful');
   }

   if (callback) {
      callback();
   }
}

var procFail = function(callback)
{
   installSuccess = false;

   if (updateState) {
      log.debug(updateState + ': installation fail, something is not correct');
   } else {
      log.debug('installation failed');
   }

   if (callback) {
      callback();
   }
}

var readAppendFile = function(file, appendFile, callback)
{
   fs.readFile(appendFile, function (err, data) {

      if (err) {

         procFail(callback);
      } else {

         fs.appendFile(file, data, function (err) {

           if (err) {

              procFail(callback);

           } else {

              procOk(callback);
           }
         })
      }
   });
}

var kernelInstall = function(kernel, new_kernel, callback)
{
   log.debug(updateState + ': check updates for kernel');

   try {

      // source file exists
      if (fs.statSync(new_kernel).isFile()) {
         log.debug("Kernel: Source file exists");
         try {

            // destination file exists
            if (fs.statSync(kernel).isFile()) {
               log.debug("Kernel: Destination file exists");
               // use md5 hash comparision for checking the files

               var kernel_hash = md5.sync(kernel);
               var new_kernel_hash = md5.sync(new_kernel);

               if (kernel_hash != new_kernel_hash) {
                   log.debug("New Kernel Detected: Kernel Updation Required.");
                  copyCmd(new_kernel, kernel, procOk, procOk, callback);

               } else {
                  log.debug("Same Kernel Detected: Kernel Updation Not Required.");
                  if (callback) {
                     callback();
                  }
               }

            } else {

               log.debug(updateState + ': ' + kernel + ' is absent');
               copyCmd(new_kernel, kernel, procOk, procOk, callback);
            }

         } catch (e) {

            log.debug(updateState + ': ' + kernel + ' read error');
            copyCmd(new_kernel, kernel, procOk, procOk, callback);
         }

     } else {

        log.debug(updateState + ': ' + new_kernel + ' is absent, skipping install');

        if (callback) {
           callback();
        }
     }

   } catch(e) {

      log.debug(updateState + ': ' + new_kernel + ' read error, skipping install');

      if (callback) {
         callback();
      }
   }
}

var configInstall = function(curFile, newFile, callback)
{
   log.debug(updateState + ': install config ' + newFile + '@ ' + curFile);

   try {

      // source file exists
      if (fs.statSync(newFile).isFile()) {

         try {

            // destination file exists
            if (fs.statSync(curFile).isFile()) {

               var source = "";
               var target = "";
               var output = "";

               try {

                  source = fs.readFileSync(newFile, 'utf8');
               } catch (e) {

                  log.debug('read file' + newFile + ' error');

                  if (callback) {
                     callback();
                  }
                  return;
               }

               try {

                  target = fs.readFileSync(curFile, 'utf8');
               } catch (e) {

                  log.debug('read file' + curFile + ' error');

                  if (callback) {
                     callback();
                  }
                  return;
               }

               var output = diff.api({
                  source: source,
                  mode: 'diff',
                  diff: target,
                  lang:'text',
               });

               if (output[0]) {

                  copyCmd(newFile, curFile, procOk, procOk, callback);

               } else {

                  if (callback) {
                     callback();
                  }
               }

            } else {

               log.debug(updateState + ': ' + curFile + ' is absent');
               copyCmd(newFile, curFile, procOk, procOk, callback);
            }

         } catch (e) {

            log.debug(updateState + ': ' + curFile + ' read error');
            copyCmd(newFile, curFile, procOk, procOk, callback);
         }

      } else {

         log.debug(updateState + ': ' + newFile + ' is absent, skipping install');

         if (callback) {
            callback();
         }
      }

   } catch(e) {

      log.debug(updateState + ': ' + newFile + ' read error, skipping install');

      if (callback) {
         callback();
      }
   }
}

var etcInstall = function(callback)
{
   setTimeout( function () {
      log.debug('copying ' + ETC_CONFIG_DIR + ' to ' + ETC_DIR);
      copyDirCmd(ETC_CONFIG_DIR + '.', ETC_DIR, procOk, procOk, callback);
   }, SYS_DELAY);
}

var selfLibInstall = function(callback)
{
   setTimeout( function () {
      log.debug('copying ' + SELF_LIB_DIR + ' to ' + LOC_LIB_DIR);
      copyDirCmd(SELF_LIB_DIR + '.', LOC_LIB_DIR, procOk, procOk, callback);
   }, SYS_DELAY);
}

var firewallStop = function(callback)
{
   setTimeout( function () {
      log.debug('disabling system firewall');
      iptablesCmd( '-F', callback, callback);
   }, SYS_DELAY);
}

var sysInstall = function(callback)
{
   setTimeout( function () {
      log.debug('updating system software modules ');
      runScript( SERVICES_CONFIG_FILE, procOk, procOk, callback);
   }, SYS_DELAY);
}

var sysLibInstall = function(callback)
{
   setTimeout( function () {
      log.debug('updating system library modules ');
      runScript( LIBRARIES_CONFIG_FILE, procOk, procOk, callback);
   }, SYS_DELAY);
}

var thirdPartyLibInstall = function(callback)
{
   setTimeout( function () {
      log.debug('copying ' + THIRDPARTY_LIB_DIR + ' to ' + LOC_LIB_DIR);
      copyDirCmd(THIRDPARTY_LIB_DIR + '.', LOC_LIB_DIR, procOk, procOk, callback);
   }, SYS_DELAY);
}

var pkgInstall = function()
{
   if (!updateState) {
      updateState = 'installPkg';
   }

   // validate the values to be proper
   if (!upgradeVersion || !activeVersion || !hwVersion || !updateState) {

      publishMessage(activeVersion + ' ' + upgradeVersion +
             ' ' + hwVersion + ': install failed');
      setTimeout(procErr, EXIT_DELAY);

      return;
   }

   log.debug(updateState + ' install process starts');
   publishMessage(updateState + ' install process running...');
   installSuccess = true;

   switch (updateState) {

   default:
   case 'installPkg':

      updateState = 'installPkg';

      // get the package file name, proper
      fileName = upgradeVersion + '.tar.gz';
      filePath = BKUP_DIR + fileName;

      // bkup working version, here
      CURR_BKUP_DIR = BKUP_DIR + activeVersion;

      // the new working dir
      NEW_WORKING_DIR = BKUP_DIR + upgradeVersion;

      log.debug('installing ' + upgradeVersion + ': ' + fileName + ' in ' + hwVersion);

      bkupDirDelete();
      break;

   // new pkg install.js
   case 'installRest':


      async.series([

         /* copy it to /boot if not same (.src/kerneel/config.txt) */
         function(callback) {

            updateState = 'kernelConfig';
            configInstall(KERNEL_CONFIG_FILE, NEW_KERNEL_CONFIG_FILE, callback);
         },

         function(callback) {

            updateState = 'kernelConfig';
            configInstall(KERNEL_CMDLINE_FILE, NEW_KERNEL_CMDLINE_FILE, callback);
         },

         function(callback) {

            updateState = 'updateEtc';

            if (installSuccess === true) {

               etcInstall(callback);

            } else {

               callback();
            }
         },

         function(callback) {

            updateState = 'UpdateSelfLib';

            if (installSuccess === true) {

               selfLibInstall(callback);
            } else {

               callback();
            }
         },

         function(callback) {

            updateState = 'installThirdParty';

            if (installSuccess === true) {

               thirdPartyLibInstall(callback);
            } else {

               callback();
            }
         },

         function(callback) {

            updateState = 'diagSvcStop';
            publishMessage('stopping diagnostics services');
            diagSvcStop(callback);
         },

         function(callback) {
            updateState = 'firewallStop';

            if (installSuccess === true) {

               publishMessage('disabling system firewall');
               firewallStop(callback);
            } else {

               callback();
            }
         },

         function(callback) {
            updateState = 'installSysUpdates';

            if (installSuccess === true) {

               publishMessage('updating system software');
               sysInstall(callback);
            } else {

               callback();
            }
         },

         function(callback) {
            updateState = 'installSysLib';

            if (installSuccess === true) {

               publishMessage('installing system libraries');
               sysLibInstall(callback);
            } else {

               callback();
            }
         },

         function(callback) {

            updateState = 'installKernel';
            kernelInstall(KERNEL_FILE, NEW_KERNEL_FILE, callback);
         },

         // for now start the gpio service
         function(callback) {

            updateState = 'installSvcs';
            publishMessage('installing services');
            otherSvcsRestart(callback);
         },

         function(callback) {

            updateState = 'installRest';
            if (installSuccess === true) {

               publishMessage(updateState + ' installation complete');
               procDone();
               publishMessage('complete');
            } else {

               publishMessage(updateState + ' installation fail');
               procErr();
               publishMessage('fail');
            }
            callback();
         }
      ]);
   }
}
