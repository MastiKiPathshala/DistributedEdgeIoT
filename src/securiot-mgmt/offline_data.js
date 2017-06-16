/*************************************************************************
 *
 * $file: offline_data.js
 *
 * @brief: offline data hander
 *
 * @date: 09 June 2017 First version of offline data
 *
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE.txt', which is part of this source code package.
 *
 ************************************************************************/
var fs       = require('fs');
var rl       = require('readline');
var os       = require("os");
var exec     = require('child_process').exec;
var moment   = require('moment-timezone');

var offlineFiles = {};

var cloudClient = require('./cloud_main');

// on network up, check try to push the data

networkState.on('online', offlineProcess);

var offlineProcess = function()
{

   if (redisClient) {

      redisClient.hgetall(OFFLINE_DATA_FILE_TAG, funtion(err, res) {

         var processFlag = false;

         if (!err && res) {

            // store in a list, for later processing

            for (var file in res) {

               processFlag = true;
               offlineFiles.push(file);
            }
         }

         log.debug('processing offline data file (' + file);

         if (processFlag === true) {
            offlineProcessFile();
         }
      });
   }
}

var offlineProcessFile = function()
{
   var file = offlineFiles.slice(0, 1);
   var writeBufer = {};

   if (file != undefined) {

      if (fs.existsSync(file)) {

         var rl = readline.createInterface({
                input: fs.createReadStream(file) });

         // read line by line to push data

         rl.on('line', function(linebuf) {

            if (networkState.online === true) {

               offlineSendToCloud(linebuf, function(err) {

                  if (err) {
                     writeBuffer.push(linebuf);
                  }
               });
            } else {

               writeBuffer.push(linebuf);
            }
         });

         // when read, pick the next file
         // also mark current file for delete

         rl.on('close', function() {

            if (writeBuffer.length === 0) {

               setTimeout(offlineProcessFile, OFFLINE_DELAY);
               setTimeout(offlineDeleteFile(file), FILE_DELETE_DELAY);;
            } else {

               setTimeout(offlineDeleteFile(file, writeBuffer), FILE_DELETE_DELAY);;
            }
         });

      } else {

         offlineDeleteFile(file);
      }
   }
}

var offlineDeleteFile = function(file, writeBuffer)
{
   log.debug('offline data file ' + file + ' delete');

   if (fs.existsSync(file)) {

      exec('sudo rm -rf ' + file, function() {

         log.debug('offline data file ' + file + ' deleted');
         offlineFlushFile(file, writeBuffer);
      });

   } else {

      offlineFlushFile(file, writeBuffer);
   }

}

var offlineFlushFile = function(file, writeBuffer)
{
   if (typeof writeBuffer === undefined) {

      redisClient.hget(OFFLINE_DATA_FILE_TAG, file, function(err, res) {

         if (!err && res) {

            redisClient.hdel(OFFLINE_DATA_FILE_TAG, file, function(err, res) {

               if (err) {
                  log.debug('offline data file entry ' + file + ' delete fail from db');
               }
            });
         }
      });

   } else {

      var cmd = "sudo cat " + writeBuffer + " >> " + file;

      exec (cmd, function () {

         log.trace ("Message stored offline");
      });
   }
}

var offlineSendToCloud = function(message, callback)
{
   cloudClient.sendtoCloud(message, callback);
}
