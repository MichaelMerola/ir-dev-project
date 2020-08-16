import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-data-display',
  templateUrl: './data-display.component.html',
  styleUrls: ['./data-display.component.css']
})

export class DataDisplayComponent implements OnInit {

  constructor() { }

  /** DATA-DISPLAY COMPONENT
   * // this file functions as the intermediary between the node/express backend and the Angular client utility
   * 
   * startTimer():  on component init, set timer to request data from API at specified interval (60 sec)
   * requestButton(): resets the timer and requests data on button press
   * callAPI():     data from the xml file is recieved via express/API and stored in local objects to be parsed
   * 
   * convertTime(): change SystemTime from YYYY-MM-DDT00:00:00Z to standard format for easy viewing
   * getContacts(): parses for contact info in the UserInterface->ContactInfo objects
   * 
   * getCalls():    !!
   * 
   * getDiagnostics(): parses for critical info messages in the SystemUnit object; red=error, yellow=warning
   *                ** also compares the "last run date" detail to current date, display error if > year outdated
   * 
   * analyzeSystem():  parses SystemUnit object for extra details including hardware fans and software options.
   *                ** if any hardware fans are below avg rpm, display a notice
   * 
   * getPeripherals(): parses Peripherals->ConnectedDevice objects to list all devices with detail and status.
   *                ** if device is a camera, use Cameras obj to get extra details like model, serial no, etc..
   * 
   * getNetworkInfo(): parses Network & NetworkServices objects for info on CDP, Ethernet, IPv4/6, DNS, and NTP
   *                ** uses objectToRows() helper to aid with data parsing that is simlar between objs
   * 
  */

  // variables for tracking time
  requestSec: number = 60;
  timeUntilRequest: number; //1min intervals
  interval;

  Peripherals: object;
  Cameras: object;

  Network: object;
  Capabilities: object;
  SystemTime: string = "00:00:00";
  ContactInfo: string[] = ['Name','Email','Number'] ;

  //** CLASS FUNCTIONS **//

  startTimer(reqlength: number) {
    this.timeUntilRequest = reqlength;

    this.interval = setInterval(() => {

      if (this.timeUntilRequest > 0) { // time still remaining
        this.timeUntilRequest--;

      } else {
        this.callAPI();
        this.timeUntilRequest = reqlength;
      }
    }, 1000);
  }//end startTimer()

  requestButton() {
    this.timeUntilRequest = this.requestSec;
    this.callAPI();
  }

  callAPI(): void {
    console.log("requesting data from localhost:9000...");

    fetch('http://localhost:9000/data-api')
      .then(res => res.text())
      .then(res => { 
        
        //parse data into a usable JSON object
        let asset = JSON.parse(res);

        //get System Time and Contact Info
        this.SystemTime = this.convertTime( asset.Status.Time[0].SystemTime[0] );
        this.ContactInfo = this.getContacts( asset.Status.UserInterface[0].ContactInfo[0] );

        //get Info from System, Calls, and Diagnostics
        let SystemUnit = asset.Status.SystemUnit[0];
        this.getDiagnostics(SystemUnit);
        this.analyzeSystem(SystemUnit);
        this.getCalls(SystemUnit, asset.Status.Call, asset.Status.Capabilities[0].Conference[0]);

        // get connected peripheral devices and camera info
        this.getPeripherals(asset.Status.Peripherals[0].ConnectedDevice, asset.Status.Cameras[0].Camera);

        // get info on the various networks
        this.getNetworkInfo(asset.Status.Network[0], asset.Status.NetworkServices[0]);

      
        // console.log(this.ContactInfo);
      });
  }//end callAPI()

  // convert YYYY-MM-DDT00:00:00Z string into readable date
  convertTime (rawtime: string): string {

    let trueDate = new Date(rawtime);
    return trueDate.toString().substring(0, 28)
  }

  // get contact info from asset
  getContacts (contactObj: any): string[] {
    return new Array(
      String(contactObj.Name[0]),
      String(contactObj.ContactMethod[0].Number),
      String(contactObj.ContactMethod[1].Number)
    );
  }

  //call details
  MaxCalls: number;
  activeCalls: number;
  videoCalls: number = 0;
  audioCalls: number = 0;
  maxActive: number;
  maxVideo: number;
  maxAudio: number;
  activeWarn: boolean = false;
  videoWarn: boolean = false;
  audioWarn: boolean = false;

  callStatus: string = 'Unknown.';
  isConnect: boolean = false;
  callType: string;
  callAnswer: string;
  CallDetails: string[];

  // DETERMINE CALL STATUS //
  getCalls(sysdata: any, callList: any, capableList: any) {
    // get number of active calls on system
    this.activeCalls = Number(sysdata.State[0].NumberOfActiveCalls[0]);
    this.videoCalls = 0;
    this.audioCalls = 0;

    // get maximum capable call numbers
    this.MaxCalls = capableList.MaxCalls;
    this.maxActive = capableList.MaxActiveCalls;
    this.maxVideo = capableList.MaxVideoCalls;
    this.maxAudio = capableList.MaxAudioCalls;

    // For every active call in list...
    callList.forEach(call => {

      // store and display the type/status of active call
      this.callStatus = call.Status[0];
      this.callType = call.CallType[0];
      this.callAnswer = call.AnswerState[0];

      //count call types
      if (call.CallType[0] === 'Video') {
        this.videoCalls += 1;
      } else {this.audioCalls++}

      //display call details if connected (live)
      if (this.callStatus == 'Connected') {
        this.isConnect = true;
        let tempCall: string[] = [];
        
        // for every item in the call details, record a string that includes key + value
        //**excludes keys already parsed or object vals
        Object.keys(call).forEach(function(key) {
          let val = (call[key]).toString();
          //exclude unnecessary data
          if (! val.includes('object') && ! key.includes('CallType') && 
              ! key.includes('AnswerState') &&
              ! key.includes('Status')
              ) {
            //add row to display list
            let row = key + ': ' + val;
            tempCall.push(row);
          }
  
        })
        //set list to class variable
        this.CallDetails = tempCall;
  
      }//end if
    })//end forEach call

    // check if calls are near max limit
    if (this.activeCalls >= (this.maxActive/2)) {this.activeWarn = true}
    if (this.videoCalls >= (this.maxVideo/2)) {this.videoWarn = true}
    if (this.audioCalls >= (this.maxAudio/2)) {this.audioWarn = true}

  }//end getCalls()

  //diagnostic details
  lastRunDiagn: string;
  lastRunWarn: boolean = false;
  ErrDetails: object[];
  WarnDetails: object[];

  // DISPLAY DIAGNOSTIC ERRORS //
  getDiagnostics(sysdata: any) {
    // convert last diagnostic run time into a readable date
    this.lastRunDiagn = this.convertTime(sysdata.Diagnostics[0].LastRun[0]._);

    //check when the last time Diagnostics was run
    let lastrunDate = new Date(sysdata.Diagnostics[0].LastRun[0]._);
    let currDate = new Date(this.SystemTime);
    //if over a year, suggest they run diagnostics again
    if ( (lastrunDate.getFullYear() - currDate.getFullYear()) != 0) {
      this.lastRunWarn = true;
    }

    // create a Diagnostic for each item in data
    let diagnList = sysdata.Diagnostics[0].Message;
    let tempErr: object[] = [];
    let tempWarn: object[] = [];

    diagnList.forEach(item => {

      let diagnostic = new Object({
        level: item.Level[0]._,
        type: item.Type[0]._,
        description: item.Description[0]._
      })

      if (item.Level[0]._ === 'Error') {
        tempErr.push(diagnostic);
      } else {
        tempWarn.push(diagnostic);
      }

    });
    this.ErrDetails = tempErr;
    this.WarnDetails = tempWarn;
  }//end getDiagnostics()

  //system details
  productDetail: string;
  serialNumber: string;
  FanDetails: string[];
  softName: string;
  softVersion: string;
  falseOptions: string[];
  trueOptions: string[];

  // DETERMINE SYSTEM STATUS //
  analyzeSystem(sysdata: any) {
    // set product ID, platform, type, and serial number
    this.productDetail = String(sysdata.ProductId[0] + ', ' + sysdata.ProductType[0]);
    this.serialNumber = sysdata.Hardware[0].Module[0].SerialNumber[0];

    // Hardware
    let tempFans: string[] = [];
    //put each fan and status into list
    (sysdata.Hardware[0].Monitoring[0].Fan).forEach(function(fan) {
      let status: string = (fan.Status[0]);
      if (2550 > Number(status.substring(0,4)) ) {
        console.log('low');
        status = String( status + ' !! low');
      }
      tempFans.push(status);
    })
    this.FanDetails = tempFans

    //Software
    this.softName = sysdata.Software[0].Name[0];
    this.softVersion = String('version ' + sysdata.Software[0].Version[0] + ', released ' + sysdata.Software[0].ReleaseDate[0]);

    let optList = sysdata.Software[0].OptionKeys[0];
    let tempOn: string[] = [];
    let tempOff: string[] = [];

    Object.keys(optList).forEach(function(option) {

      let val = String(optList[option]);
      if (val === 'True') {
        tempOn.push(option);
      } else {
        tempOff.push(option);
      }
    });
    this.trueOptions = tempOn;
    this.falseOptions = tempOff;

  }//end analyzeSystem()

  // device details
  DevicesDetail: object[];
  CamerasDetail: object[];

  // DISPLAY PERIPHERAL DEVICES INFO //
  getPeripherals(deviceList: any, cameraList: any) {
    let tempDev: object[] = [];
    let tempCam: object[] = [];

    deviceList.forEach(item => {

      //if peripheral needs additional data on a camera..
      if (item.Type[0] === 'Camera') {
        //find device in camera list
        cameraList.forEach(cam => {
          //ids match!
          if (item.ID[0] === cam.MacAddress[0]) {

            let camera = new Object({
              hardwareInfo: item.HardwareInfo[0],
              id: item.ID[0],
              name: item.Name[0],
              softwareInfo: item.SoftwareInfo[0],
              status: item.Status[0],
              type: item.Type[0],
              upgradeStatus: item.UpgradeStatus[0],
              isConnected: cam.Connected[0],
              isFlip: cam.Flip[0],
              manufact: cam.Manufacturer[0],
              model: cam.Model[0],
              serial: cam.SerialNumber[0],
              softID: cam.SoftwareID[0]
            })
            tempCam.push(camera);

          } else { console.log('no matching device id !!')}
        })//end forEach cam

      // otherwise gather standard data on peripheral device
      } else {
        let device = new Object({
          hardwareInfo: item.HardwareInfo[0],
          id: item.ID[0],
          name: item.Name[0],
          softwareInfo: item.SoftwareInfo[0],
          status: item.Status[0],
          type: item.Type[0],
          upgradeStatus: item.UpgradeStatus[0]
        })
        tempDev.push(device);
      }//end if camera

    });//end forEach device

    //set global variables
    this.DevicesDetail = tempDev;
    this.CamerasDetail = tempCam;

  }//end getPeripherals()

  //network details
  ciscoAddress: string;
  ciscoInfo: string[];
  ethernetInfo: string[];
  ipv4Info: string[];
  ipv6Info: string[];
  dnsName: string;
  dnsServers: string[];
  ntpInfo: string[];

  // DISPLAY NETWORK INFO //
  getNetworkInfo(netdata: any, netservice: any) {

    // Cisco Discovery Protocol (CDP) //
    let cdp = netdata.CDP[0];
    this.ciscoAddress = cdp.Address[0]; //set variables to display info
    this.ciscoInfo = this.objectToRows(cdp); //split objects in cdplist into keys and vals

    // Ethernet //
    this.ethernetInfo = this.objectToRows(netdata.Ethernet[0]);

    // IPv4 / IPv6 //
    this.ipv4Info = this.objectToRows(netdata.IPv4[0]);
    this.ipv6Info = this.objectToRows(netdata.IPv6[0]);

    // DNS //
    this.dnsName = netdata.DNS[0].Domain[0].Name[0]; //set name to display info
    //get server list in DNS obj
    let dns = netdata.DNS[0].Server;
    let tempServ: string[] = [];
    let i = 0;
    dns.forEach(item => { 
      i++; //track index
      if (item.Address[0] != "") { //if field is not empty
        //push data
        tempServ.push( 
          String('Server ' + i + ' Address: ' + item.Address[0])
        )
      }
    })
    this.dnsServers = tempServ;

    console.log(this.dnsServers);

    // NTP //
    this.ntpInfo = this.objectToRows(netservice.NTP[0]);


  }//end getNetworkInfo()

  // helper function to parse objects into an array of key/val row strings
  // ie. row = "key: val"
  private objectToRows(obj: object): string[] {
    let tempCall: string[] = [];

    // for each key/val pair in obj
    Object.keys(obj).forEach(function(key) {
      let val = (obj[key]).toString();

      if (val != "" && !val.includes('object') ) { //ignore empty values or objects
        let row = key + ': ' + val;
        tempCall.push(row);
      }
    })

    // check if any data was gathered
    if (tempCall === undefined || tempCall.length == 0) {
      // array empty or does not exist
      return ["No Connections"];
    }

    return tempCall;
  }


  ngOnInit(): void {
    // initial API request, 
    // utilizes class functions to parse data into global variables to display via html.
    this.callAPI();
    // start timer to request data every 60 seconds.
    this.startTimer(this.requestSec);

    console.log("frontend listening at http://localhost:4200/");
  }

}
