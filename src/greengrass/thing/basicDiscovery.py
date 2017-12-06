# /*
# * Copyright 2010-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# *
# * Licensed under the Apache License, Version 2.0 (the "License").
# * You may not use this file except in compliance with the License.
# * A copy of the License is located at
# *
# *  http://aws.amazon.com/apache2.0
# *
# * or in the "license" file accompanying this file. This file is distributed
# * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
# * express or implied. See the License for the specific language governing
# * permissions and limitations under the License.
# */


import json
import logging
import os
import platform
import random
import subprocess
import sys
from threading import Timer, Thread
import time
import uuid
from AWSIoTPythonSDK.core.greengrass.discovery.providers import DiscoveryInfoProvider
from AWSIoTPythonSDK.core.protocol.connection.cores import ProgressiveBackOffCore
from AWSIoTPythonSDK.MQTTLib import AWSIoTMQTTClient
from AWSIoTPythonSDK.exception.AWSIoTExceptions import DiscoveryInvalidRequestException

now = time.asctime()

deviceMetricTopic = "zededa/machine/health"
sensorTelemetryTopic = "zededa/sensor/telemetry"

def call_at_interval(time, callback, args):
    while True:
        timer = Timer(time, callback, args=args)
        timer.start()
        timer.join()

def setInterval(time, callback, *args):
    Thread(target=call_at_interval, args=(time, callback, args)).start()

flag = 	True
def GenerateRandNumber():
    global flag
    if flag == True :
        lower_ac = 1
        upper_ac = 10
        lower_mg = 1
        upper_mg = 10
        lower_gy = 1
        upper_gy = 10
        lower_amb = 23
        upper_amb = 33
        lower_obj = 12
        upper_obj = 32
        flag = False
    else:
        lower_ac = 20
        upper_ac = 50
        lower_mg = 5
        upper_mg = 15
        lower_gy = 5
        upper_gy = 15
        lower_amb = 28
        upper_amb = 38
        lower_obj = 17
        upper_obj = 37
        flag = True

    #RangeChecker()
    #setInterval(10,RangeChecker)

    ##### Accelerometer ########
    currentTime = now
    acx = random.uniform(lower_ac, upper_ac);
    acy = random.uniform(lower_ac, upper_ac);
    acz = random.uniform(lower_ac, upper_ac);
    ac = str(acx)+","+str(acy)+","+str(acz)
    finalDataAc = ac+"-"+"24:6f:83"+"-"+"accelerometer"+"-"+"G"
    #print finalDataAc

    accelerometer = finalDataAc
    splitAccelerometer = accelerometer.split("-")
    accelerometerData = splitAccelerometer[0]
    splitAccelerometerData = accelerometerData.split(",")
    accelerometerX = float(splitAccelerometerData[0])
    accelerometerY = float(splitAccelerometerData[1])
    accelerometerZ = float(splitAccelerometerData[2])
    finalAccelerometerData = json.dumps({"uuid":"345","sensorId": " accelerometer-"+splitAccelerometer[1], "dataType" :splitAccelerometer[2],"dataUnit":splitAccelerometer[3],"accelerometer_x":accelerometerX, "accelerometer_y":accelerometerY, "accelerometer_z":accelerometerZ, "time": currentTime})

    mqttRelayDataSend (finalAccelerometerData)

    ##### Magnetometer #######
    currentTime = now
    mgx = random.uniform(lower_mg, upper_mg)
    mgy = random.uniform(lower_ac, upper_mg)
    mgz = random.uniform(lower_mg, upper_mg)
    mg = str(mgx)+","+str(mgy)+","+str(mgz)
    finalDataMg = mg+"-"+"24:6f:83"+"-"+"magnetometer"+"-"+"uT"

    magnetometer = finalDataMg
    splitMagnetometer = magnetometer.split("-")
    magnetometerData = splitMagnetometer[0]
    splitMagnetometerData = magnetometerData.split(",")
    magnetometerX = float(splitMagnetometerData[0])
    magnetometerY = float(splitMagnetometerData[1])
    magnetometerZ = float(splitMagnetometerData[2])
    finalMagnetometerData = json.dumps({"uuid":"345","sensorId": " magnetometer-"+splitMagnetometer[1],"dataType":splitMagnetometer[2],"dataUnit":splitMagnetometer[3],"magnetometer_x": magnetometerX, "magnetometer_y": magnetometerY, "magnetometer_z": magnetometerZ, "time": currentTime})

    mqttRelayDataSend (finalMagnetometerData)

    ###### Gyroscope #########
    currentTime = now
    gyx = random.uniform(lower_gy, upper_gy)
    gyy = random.uniform(lower_gy, upper_gy)
    gyz = random.uniform(lower_gy, upper_gy)
    gy = str(gyx)+","+str(gyy)+","+str(gyz)
    finalDataGy = gy+"-"+"24:6f:83"+"-"+"gyroscope"+"-"+"deg/s"

    gyroscope = finalDataGy
    splitGyroscope =gyroscope.split("-")
    gyroscopeData = splitGyroscope[0]
    splitGyroscopeData = gyroscopeData.split(",")
    gyroscopeX = float(splitGyroscopeData[0])
    gyroscopeY = float(splitGyroscopeData[1])
    gyroscopeZ = float(splitGyroscopeData[2])
    finalGyroscopeData = json.dumps({"uuid":"123","sensorId" : "gyroscope-"+splitGyroscope[1], "dataType" :splitGyroscope[2],"dataUnit":splitGyroscope[3],"gyroscope_x":gyroscopeX, "gyroscope_y":gyroscopeY, "gyroscope_z":gyroscopeZ, "time": currentTime})

    mqttRelayDataSend (finalGyroscopeData);

    ###### Ambient Temperature ########
    currentTime = now
    amb = random.randint(lower_amb, upper_amb)
    finalDataAmb = str(amb)+"-"+"24:6f:83"+"-"+"ambientTemperature"+"-"+"C"

    tempData = finalDataAmb
    splitTemp = tempData.split("-")
    sensorDataType = splitTemp[2]
    sensorData = int(splitTemp[0])
    finalAmbTempData = json.dumps({"uuid":"823","sensorId": sensorDataType+"-"+splitTemp[1],"ambTemData": sensorData, "dataType": sensorDataType, "dataUnit": splitTemp[3],"time": currentTime})

    mqttRelayDataSend(finalAmbTempData)

    ######### Object Temperature ############
    currentTime = now
    obj = random.randint(lower_obj, upper_obj)
    finalDataObj = str(obj)+"-"+"24:6f:83"+"-"+"objectTemperature"+"-"+"C"

    objTemp = finalDataObj
    splitTemp = objTemp.split("-")
    sensorDataType = splitTemp[2]
    sensorData = int(splitTemp[0])
    finalObjTempData = json.dumps({"uuid":"567","sensorId": sensorDataType+"-"+splitTemp[1], "objTemData": sensorData, "dataType": sensorDataType, "dataUnit": splitTemp[3],"time": currentTime})

    mqttRelayDataSend(finalObjTempData)


#setInterval(5,GenerateRandNumber)
def mqttRelayDataSend(data):
    myAWSIoTMQTTClient.publish(sensorTelemetryTopic, data, 0)
    print data

# General message notification callback
def customOnMessage(message):
    print("Received a new message: ")
    print(message.payload)
    print("from topic: ")
    print(message.deviceMetricTopic)
    print("--------------\n\n")
# end-def-customOnMessage

def FillMetricsData():
    metrics = {}
    cpuDetail = []
    cpuCmd = subprocess.Popen('top -bn1 | grep "Cpu(s)"', shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    outputUtl = cpuCmd.stdout.readlines()
    #print outputUtl
    for index in range (len(outputUtl)):
        cpuInfo = outputUtl[index].split(",")
        cpuDetail.append(cpuInfo[0].strip("%Cpu(s):"))
        cpuDetail.append(cpuInfo[1].strip("sy"))
        cpuDetail.append(cpuInfo[2].strip("ni"))
        cpuDetail.append(cpuInfo[3].strip("id"))
        cpuDetail.append(cpuInfo[4].strip("wa"))
        cpuDetail.append(cpuInfo[5].strip("hi"))
        cpuDetail.append(cpuInfo[6].strip("si"))
        cpuDetail.append(cpuInfo[7].strip("st\n"))
        #print cpuInfo
    #print("cpudetail: ",cpuDetail)
    p = subprocess.Popen('cat /proc/meminfo', shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    output = p.stdout.readlines()
    memDetail = []
    for line in range (len(output)-1):
        #print line,
        memoryInfo = output[line].split(":")[1].strip()
        memDetail.append(memoryInfo.strip("\tkB\n"))
    #FillMetricsData()
    #metrics = {}
    metrics['userCpuTime'] = cpuDetail[0]
    metrics['systemCpuTime'] = cpuDetail[1]
    metrics['nice'] = cpuDetail[2]
    metrics['idle'] = cpuDetail[3]
    metrics['wait'] = cpuDetail[4]
    metrics['cpuUtilization'] = 100 - float(cpuDetail[3].strip())
    metrics['steal'] = cpuDetail[7]
    metrics['irq'] = cpuDetail[5]
    metrics['totalMemory'] = memDetail[0]
    metrics['availableMemory'] = memDetail[2]
    metrics['usedMemory'] = int(memDetail[0])-int(memDetail[2])
    metrics['freeMemory'] = memDetail[1]
    #print("metrics_data",metrics_data)
    retval = p.wait()
    return metrics
# end-def-FillMetricsData

MAX_DISCOVERY_RETRIES = 10
GROUP_CA_PATH = "./groupCA/"


with open('/etc/zededa/config/config.json', 'r') as configFile:
    configJson = json.loads (configFile.read())
    configFile.close()
# end-with
print configJson
certsPath = "/etc/zededa/certs/"
host = configJson["iotHost"]
rootCAPath = certsPath + configJson["caPath"]
certificatePath = certsPath + configJson["certPath"]
privateKeyPath = certsPath + configJson["keyPath"]
clientId = configJson["thingName"]
thingName = configJson["thingName"]

if not certificatePath or not privateKeyPath:
    parser.error("Missing credentials for authentication.")
    exit(2)

# Configure logging
logger = logging.getLogger("AWSIoTPythonSDK.core")
logger.setLevel(logging.DEBUG)
streamHandler = logging.StreamHandler()
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
streamHandler.setFormatter(formatter)
logger.addHandler(streamHandler)

# Progressive back off core
backOffCore = ProgressiveBackOffCore()

# Discover GGCs
discoveryInfoProvider = DiscoveryInfoProvider()
discoveryInfoProvider.configureEndpoint(host)
discoveryInfoProvider.configureCredentials(rootCAPath, certificatePath, privateKeyPath)
discoveryInfoProvider.configureTimeout(10)  # 10 sec

retryCount = MAX_DISCOVERY_RETRIES
discovered = False
groupCA = None
coreInfo = None
while retryCount != 0:
    try:
        discoveryInfo = discoveryInfoProvider.discover(thingName)
        caList = discoveryInfo.getAllCas()
        coreList = discoveryInfo.getAllCores()

        # We only pick the first ca and core info
        groupId, ca = caList[0]
        coreInfo = coreList[0]
        print("Discovered GGC: %s from Group: %s" % (coreInfo.coreThingArn, groupId))

        print("Now we persist the connectivity/identity information...")
        groupCA = GROUP_CA_PATH + groupId + "_CA_" + str(uuid.uuid4()) + ".crt"
        if not os.path.exists(GROUP_CA_PATH):
            os.makedirs(GROUP_CA_PATH)
        groupCAFile = open(groupCA, "w")
        groupCAFile.write(ca)
        groupCAFile.close()

        discovered = True
        print("Now proceed to the connecting flow...")
        break
    except DiscoveryInvalidRequestException as e:
        print("Invalid discovery request detected!")
        print("Type: %s" % str(type(e)))
        print("Error message: %s" % e.message)
        print("Stopping...")
        break
    except BaseException as e:
        print("Error in discovery!")
        print("Type: %s" % str(type(e)))
        print("Error message: %s" % e.message)
        retryCount -= 1
        print("\n%d/%d retries left\n" % (retryCount, MAX_DISCOVERY_RETRIES))
        print("Backing off...\n")
        backOffCore.backOff()
    # end-try-except
# end-while

if not discovered:
    print("Discovery failed after %d retries. Exiting...\n" % (MAX_DISCOVERY_RETRIES))
    sys.exit(-1)
# end-if

# Iterate through all connection options for the core and use the first successful one
myAWSIoTMQTTClient = AWSIoTMQTTClient(clientId)
myAWSIoTMQTTClient.configureCredentials(groupCA, privateKeyPath, certificatePath)
myAWSIoTMQTTClient.onMessage = customOnMessage

connected = False
for connectivityInfo in coreInfo.connectivityInfoList:
    currentHost = connectivityInfo.host
    currentPort = connectivityInfo.port
    print("Trying to connect to core at %s:%d" % (currentHost, currentPort))
    myAWSIoTMQTTClient.configureEndpoint(currentHost, currentPort)
    try:
        myAWSIoTMQTTClient.connect()
        connected = True
        break
    except BaseException as e:
        print("Error in connect!")
        print("Type: %s" % str(type(e)))
        print("Error message: %s" % e.message)
    # end-try-except
# end-for

if not connected:
    print("Cannot connect to core %s. Exiting..." % coreInfo.coreThingArn)
    sys.exit(-2)
# end-if

# Successfully connected to the core
myAWSIoTMQTTClient.subscribe(deviceMetricTopic, 0, None)
time.sleep(2)

myPlatform = platform.platform()
if not myPlatform:
    myPlatform = "Unknown GG Core platform"
# end-if

loopCount = 0
while True:
    metrics = FillMetricsData()
    thingMsg = {
        "ThingName": thingName,
        "AppName": "AppName",
        "AppUUID": "AppUUID",
        "Platform": myPlatform,
        "Time": time.asctime(),
        "Data": metrics
    }
    print (thingMsg)
    myAWSIoTMQTTClient.publish(deviceMetricTopic, json.dumps(thingMsg), 0)
    GenerateRandNumber()
    loopCount += 1
    time.sleep(5)
# end-while
