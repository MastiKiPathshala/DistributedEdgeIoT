#
# Copyright 2010-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
#

# greengrassHelloWorld.py
# Demonstrates a simple publish to a topic using Greengrass core sdk
# This lambda function will retrieve underlying platform information and send
# a hello world message along with the platform information to the topic 'hello/world'
# The function will sleep for five seconds, then repeat.  Since the function is
# long-lived it will run forever when deployed to a Greengrass core.  The handler
# will NOT be invoked in our example since the we are executing an infinite loop.

import datetime
import greengrasssdk
import json
import platform

# Creating a greengrass core sdk client
client = greengrasssdk.client('iot-data')

myPlatform = platform.platform()
if not myPlatform:
    myPlatform = "Unknown GG Core platform"
# end-if

sensorMROTopic = 'zededa/mro/sensor'

def send_sensor_mro(thingId, mroType):
    coreId = {
        "CoreName": "saa",
        "AppName": "ZededaGGDemoApp",
        "AppUUID": "ZededaGGDemoApp",
        "Platform": myPlatform,
        "Time": str(datetime.datetime.utcnow())
    }
    mroMsg = {
        "coreId": coreId,
        "thingId": thingId,
        "mroType": mroType,
        "CreatedAt": thingId["UpdatedAt"]
    }
    client.publish (topic=deviceMROTopic, payload=json.dumps(mroMsg))
    return True
#end-def-send_sensor_mro

def function_handler(event, context):
    thingId = {
        "ThingName": event["ThingName"],
        "AppName": event["AppName"],
        "AppUUID": event["AppUUID"],
        "Platform": event["Platform"],
        "UpdatedAt": event["Time"],
    }
    if event["data"]["cpu"]["avgload"] > 0.01 || event["data"]["cpu"]["currentload"] > 0.2:
        send_sensor_mro (thingId, "High CPU")
    # end-if
    if event["data"]["memory"]["used"] > 0.01 || event["data"]["memory"]["free"] < 0.2:
        send_sensor_mro (thingId, "Low Memory")
    # end-if
    return True
# end-def-function_handler
