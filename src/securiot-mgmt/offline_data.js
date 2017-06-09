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

network.on("online", offlineProcessData);

var offlineProcessData = function()
{

   if (redisClient) {

      redisClient.hgetall(OFFLINE_DATA_FILE_TAG, funtion(err, res) {

         var processFlag = true; 
         if (!err && res) {

            for (var file in res) {
               processFlag = true; 
               offlineFiles.push(file);
            }
         }

         log.debug('processing offline data file (' + file);

         if (processFlag === true) {
            offlineProcessFiles();
         }
      });
   }
}

var offlineProcessFiles = function()
{
   var file = offlineFiles.slice(0, 1);

   if (file != undefined) {

      if (fs.existsSync(file)) {

         var rl = readline.createInterface({
                input: fs.createReadStream(file) });
         
         rl.on('line', function(linebuf) {
            offlineSendToCloud(linebuf);
         });
         
         rl.on('close', function() {
            offlineDeleteFile(file);
         });

      } else {

         offlineDeleteFile(file);
      }
   }
}

var offlineDeleteFile = function(file)
{
   log.debug('offline data file ' + file + ' delete');

   redisClient.hdel(OFFLINE_DATA_FILE_TAG, file, function(err, res) {

      if (err) {
         log.debug('offline data file ' + file + ' delete fail from db');
      }
   });

   if (fs.existsSync(file)) {
      exec('sudo rm -rf ' + file);
      log.debug('offline data file ' + file + ' deleted');
   }

}

var offlineSendToCloud = function(message, callback)
{
   cloudClient.sendtoCloud(message, callback);
}
