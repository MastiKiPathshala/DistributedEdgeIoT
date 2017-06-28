/*************************************************************************
 *
 * $file: services_main.go
 *
 * @brief: services main module
 *
 * @author: Srinibas Maharana
 *
 * @date: 22 June 2017 Place holder
 *
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE.txt', which is part of this source code package.
 *
 ************************************************************************/

package main

import (

   "fmt"
/*
    "io/ioutil"
    "encoding/json"
*/
   "os/exec"
   "time"
   "sync"
   "flag"
   "os"
   MQTT "github.com/eclipse/paho.mqtt.golang"
   "github.com/op/go-logging"
)

var log = logging.MustGetLogger("example")

var format = logging.MustStringFormatter(
   `%{color}%{time:15:04:05.000} %{shortfunc} ? %{level:.4s} %{id:03x}%{color:reset} %{message}`,
)

type Password string

func (p Password) Redacted() interface{} {
   return logging.Redact(string(p))
}

var client MQTT.Client
var topic *string

func main () {

   fmt.Println("service start")

   backend1 := logging.NewLogBackend(os.Stderr, "", 0)
   backend2 := logging.NewLogBackend(os.Stderr, "", 0)

   backend2Formatter := logging.NewBackendFormatter(backend2, format)

   backend1Leveled := logging.AddModuleLevel(backend1)
   backend1Leveled.SetLevel(logging.INFO, "")

   logging.SetBackend(backend1Leveled, backend2Formatter)

   SubscribeMqtt ()
   wg.Wait()

}

func SubscribeMqtt () {

   fmt.Println("MQTT Client Connect")

   topic  := flag.String("topic", "topic/sensor/data/#", "The topic name to/from which to publish/subscribe")
   broker := flag.String("broker", "tcp://localhost:1883", "The broker URI. ex: tcp://127.0.0.1:1883")

   id := flag.String("id", "testgoid", "The ClientID (optional)")
   cleansess := flag.Bool("clean", false, "Set Clean Session (default false)")

   qos := flag.Int("qos", 0, "The Quality of Service 0,1,2 (default 0)")

   action := flag.String("action", "sub", "Action publish or subscribe (required)")
   store  := flag.String("store", ":memory:", "The Store Directory (default use memory store)")

   flag.Parse()

   if *topic == "" {
      fmt.Println("Invalid setting for -topic, must not be empty")
      return
   }

   if *action != "pub" && *action != "sub" {
      fmt.Println("Invalid setting for -action, must be pub or sub")
      return
   }

   opts := MQTT.NewClientOptions()
   opts.AddBroker(*broker)

   opts.SetClientID(*id)
   opts.SetCleanSession(*cleansess)

   if *store != ":memory:" {

      opts.SetStore(MQTT.NewFileStore(*store))
   }

   if *action == "pub" {

      client = MQTT.NewClient(opts)

      if token := client.Connect(); token.Wait() && token.Error() != nil {

         panic(token.Error())

      }
      fmt.Println("Sample Publisher Started")

   } else {

      if *action == "sub" {

         fmt.Println("Subscriber Started")

         opts.SetDefaultPublishHandler(ReadMessage)

         client := MQTT.NewClient(opts)

         if token := client.Connect(); token.Wait() && token.Error() != nil {

            panic(token.Error())
         }

         if token := client.Subscribe(*topic, byte(*qos), nil); token.Wait() && token.Error() != nil {

            fmt.Println(token.Error())
            os.Exit(1)

         }
         procSensorData();

         wg.Add (3)

      }
   }
}

var ReadMessage MQTT.MessageHandler = func (client MQTT.Client, msg MQTT.Message) {

   fmt.Println ( msg.Topic(),string(msg.Payload()) )
   // push this data element to an array, based on data type
}

func procSensorData() {

   log.Debug("Schedule R Script run") // every 10 minutes for now

   time.AfterFunc(10 * time.Minute, procSensorData)

   // copy the data array
   // call R Script to pick up the data array
   // push the meta data over to local mqtt broker
   // flush the data array
   sd, err := exec.Command( "bash", "-c", "sudo Rscript sd.R").Output()
   _,_ = sd, err
   fmt.Println ( string(sd) )
}

var wg sync.WaitGroup
