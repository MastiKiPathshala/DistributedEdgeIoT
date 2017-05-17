/*************************************************************************
 *
 * $file: gpio_main.go
 *
 * @brief: GPIO module code
 *
 * @author: Saurabh Singh
 *
 * @date: 15 May 2017 First version of GPIO code with only UART support
 *
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE.txt', which is part of this source code package.
 *
 ************************************************************************/

 package main
 
 import (
 
    "fmt"
    "encoding/json"
	"os/exec"
	"time"
 )

 func GpsSensorData(){
 
   time.AfterFunc(1000*time.Millisecond, GpsSensorData)
   out2, err := exec.Command( "bash", "-c", "gpspipe -w -n 8 | grep -m 1 TPV").Output()
   
   if err != nil {
        fmt.Println("error occured")
        fmt.Printf("%s", err)
   }
	
	var latlon map[string]interface{}
	
	err2 := json.Unmarshal(out2, &latlon)
	if err2 != nil {
		fmt.Println("error:", err2)
	}
	//fmt.Println(latlon)
	
	lat := latlon["lat"]
    fmt.Println("latitude ", lat)
	
	lon := latlon["lon"]
    fmt.Println("longitude ", lon)
	
	/*strs := latlon["tag"].(string)
    fmt.Println(strs)*/
 }
