// upgrade hanler API on the web-service module
var fs         = require('fs');
var exec       = require ('child_process').exec;
var spawn      = require ('child_process').spawn;
var request    = require('request');
var express    = require('express');

var upgrade = express.Router();

UPGRADE_SVC      = 'securiot-upgrade';
UPGRADE_SVC_PID  = UPGRADE_SVC + '-pid';
UPGRADE_SVC_NAME = UPGRADE_SVC + '-service';

SYS_DELAY = 5000;

upgrade.get('/', function(req, res, next) {

   log.debug('get upgrade status: ' + upgradeState);

   if (upgradeState === 0) {

      res.json({success:true});
      return;
   }

   log.debug('another upgrade is currently in progress...');

   io.emit('update',
      {action:'update', status:'another upgrade is currently in progress'});

   res.json({success:false});
})

upgrade.post('/:nextVersion', function(req, res, next) {

	var upgradeVersion = req.params.nextVersion;
	softwareUpgrade (upgradeVersion, res);
})

var softwareUpgrade = function (upgradeVersion, res) {
   var state = false;
   var upgradePid;
   //var upgradeVersion = req.params.nextVersion;

   log.debug('upgrade version ' + upgradeVersion);
 
   if ((!upgradeVersion) || (upgradeVersion === 'undefined')) {

      var message = 'upgrade version value is missing';
      io.emit('update',{action:'update', status:message});
      res.json({success: state});
      return;
   }
 
   if (upgradeVersion === activeVersion) {

      var message = 'upgrade version is same as installed';
      log.debug(message);
      //io.emit('update',{action:'update',status:message});
		cloudConnect.updateRemoteCmdStatus ('softwareUpgrade', 'Failed', message, '');
      //res.json({success: state});
		cloudConnect.sendRemoteCmdResponse ('softwareUpgrade', res, {success: 'false',msg: message});
		return;
   }
 
   if (upgradeState != 0) {

      var message = 'another upgrade is currently in progress';
      io.emit('update',{action:'update',status:message});
      res.json({success: state});
      return;
   }

   redisClient.set(UPGRADE_VERSION_TAG, upgradeVersion, function(err, reply) {

      if (err) {

         log.debug('upgrade version write failed');
         io.emit('update', {action:'update',status:'failed'});
         res.json({success: state});
         return;
      }
    
      try {

         redisClient.get(UPGRADE_SVC_PID, function(err, reply) {
         
            if (err) {

               log.debug('upgrade daemon get pid failed:' + err);
               log.debug('try again after some time');
               io.emit('update', {action:'update',status:'failed'});
               res.json({success: state});
               upgradeSvcInstall();
               return;
            }
         
            upgradePid = reply;

            if (upgradePid) {

               log.debug('sending SIGHUP to upgrade daemon:' + upgradePid);
            
               try {
            
                  process.kill(upgradePid, 'SIGHUP');

               } catch(err){
            
                  if (err) {

                     log.debug('sending SIGHUP to upgrade daemon failed:' + err);
                     io.emit('update', {action:'update',status:'failed'});
                     upgradeSvcInstall();
                     return;
                  }
               }

               upgradeState += 1;
               state = true;

            } else {

               log.debug('upgrade daemon get pid failed:' + upgradePid);
               io.emit('update', {action:'update',status:'failed'});
               upgradeSvcInstall();
            }
         });

      } catch (e) {

         log.debug('upgrade daemon get pid failed:' + e);
         io.emit('update', {action:'update',status:'failed'});
         upgradeSvcInstall();
      }
   });
 
   //res.json({success:state});
}

// command functions

function forEverSvcCmd (svcName, svcModule, scriptName, cb_error, cb_next)
{
   ret_code = 0;

   var child = spawn('/usr/bin/forever-service',
                    ['install', '--script', WORKING_DIR + svcModule + '/bin/' + scriptName, '--start',
                     svcName],
                    { cwd : WORKING_DIR } ), me = this;

   child.stderr.on('data', function (data) {

        data += ' ';
        me.stderr = data.toString();

   });
   
   child.stdout.on('data', function (data) { 

        data += ' ';
        me.stdout = data.toString();
        log.debug('forever-service: stdout:' + me.stdout);

   });
  
   child.stdout.on('end', function () {

      if (me.stdout) {
         log.debug('forever-service: stdout:' + me.stdout);
      }

      if (me.stderr) {
         log.debug('forever-service: stderr:' + me.stderr);
      }

   });
   
   child.on('exit', function (code, signal)
         { if (code) {ret_code = code;} });

   child.on('close', function (code) {

      if (code) {ret_code = code;}

      if (ret_code) {

         log.debug ('forever-service: error (' + ret_code + ') ' + svcName); 

         setTimeout(cb_error, SYS_DELAY);

      } else {

         log.debug ('forever-service stop ' + svcName);

         setTimeout(cb_next, SYS_DELAY);
      }
   });
}

var procErr = function()
{
}

var procDone = function(res)
{
}

var upgradeSvcInstall = function() 
{
   forEverSvcCmd(UPGRADE_SVC_NAME, UPGRADE_SVC, 'upgrade.js' + procErr, procDone);
}

module.exports = upgrade;
module.exports.softwareUpgrade = softwareUpgrade;
