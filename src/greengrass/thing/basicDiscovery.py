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


import os
import sys
import time
import uuid
import logging
import argparse
from AWSIoTPythonSDK.core.greengrass.discovery.providers import DiscoveryInfoProvider
from AWSIoTPythonSDK.core.protocol.connection.cores import ProgressiveBackOffCore
from AWSIoTPythonSDK.MQTTLib import AWSIoTMQTTClient
from AWSIoTPythonSDK.exception.AWSIoTExceptions import DiscoveryInvalidRequestException

import subprocess
import json

from threading import Timer, Thread

# General message notification callback
def customOnMessage(message):
    print("Received a new message: ")
    print(message.payload)
    print("from topic: ")
    print(message.topic)
    print("--------------\n\n")


MAX_DISCOVERY_RETRIES = 10
GROUP_CA_PATH = "./groupCA/"

# Read in command-line parameters
parser = argparse.ArgumentParser()
parser.add_argument("-e", "--endpoint", action="store", required=True, dest="host", help="Your AWS IoT custom endpoint")
parser.add_argument("-r", "--rootCA", action="store", required=True, dest="rootCAPath", help="Root CA file path")
parser.add_argument("-c", "--cert", action="store", dest="certificatePath", help="Certificate file path")
parser.add_argument("-k", "--key", action="store", dest="privateKeyPath", help="Private key file path")
parser.add_argument("-n", "--thingName", action="store", dest="thingName", default="Bot", help="Targeted thing name")
parser.add_argument("-t", "--topic", action="store", dest="topic", default="sdk/test/Python", help="Targeted topic")

args = parser.parse_args()
host = args.host
rootCAPath = args.rootCAPath
certificatePath = args.certificatePath
privateKeyPath = args.privateKeyPath
clientId = args.thingName
thingName = args.thingName
topic = args.topic

if not args.certificatePath or not args.privateKeyPath:
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

if not discovered:
    print("Discovery failed after %d retries. Exiting...\n" % (MAX_DISCOVERY_RETRIES))
    sys.exit(-1)

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

if not connected:
    print("Cannot connect to core %s. Exiting..." % coreInfo.coreThingArn)
    sys.exit(-2)

# Successfully connected to the core
myAWSIoTMQTTClient.subscribe(topic, 0, None)
time.sleep(2)

loopCount = 0
while True:
    metrics = FillMetricsData()
    myAWSIoTMQTTClient.publish(topic, metrics, 0)
    loopCount += 1
    time.sleep(1)

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
    metrics['cpuUtilization'] = 100- float(cpuDetail[3].strip())
    metrics['steal'] = cpuDetail[7]
    metrics['irq'] = cpuDetail[5]
    metrics['totalMemory'] = memDetail[0]
    metrics['availableMemory'] = memDetail[2]
    metrics['usedMemory'] = int(memDetail[0])-int(memDetail[2])
    metrics['freeMemory'] = memDetail[1]
    metrics_data = json.dumps(metrics)
    #print("metrics_data",metrics_data)
    retval = p.wait()
    return metrics_data

