//todo: color by bus route
//todo: KML layers for RT, bus routes
//todo: toggle routes by number

var rendererOptions = {
    draggable: true
};
var map;
var mbtaRTLayer, mbtaKeyBusLayer;
var boston = new google.maps.LatLng(42.37, -71.1);
var markers = {};
var savedWPs = [];
var numPoints = 2;     // number of points available in points object
var points = new Points(numPoints)  // object for generating colors
var usedPoints = 0;    // number of color points in use (or in freeColors)
var numMarkers = 0;    // number of markers
var lastIndex = {};    // table of indices where bus ID appears last
var freeColors = [];   // colors available for reuse
var animInterval = 10;  // num of milliseconds for simulation tick
var mostRecentUpdate = {};  // table mapping bus ID to timestamp of most recent update

var routeNames = {
    "701": "CT1",
    "747": "CT2",
    "708": "CT3",
    "741": "SL1",
    "742": "SL2",
    "751": "SL4",
    "749": "SL5"    
};
function getRouteName(route) { return (route in routeNames ? routeNames[route] : route); }

function newISO8601Date(d) {
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    // Input: "2012-01-02 12:00:00"
    // Converts to: "02 Jan 2012 12:00:00 EDT"
    year = d.substr(0,4);
    mon = d.substr(5,2);
    day = d.substr(8,2);
    rest = d.substr(10);
    newD = day + " " + months[parseInt(mon) - 1] + " " + year + rest + " EDT"; // EDT for this case, Oct 2011
    // Returns JS date
    return new Date(newD);
}

function findLastIndices(rt) {
    for(i in rt) {
        lastIndex[rt[i].vehicle] = i;
    }
}

function pickColor() {
    var color;

    if((color=freeColors.pop())) {
        return color;
    }
    if(usedPoints >= numPoints) {
        points = new Points(numPoints * 2)
        for(i=0;i<numPoints;i++) { points.pick() }
        numPoints *= 2;
    }
    var point = points.pick();
    usedPoints++;
    var _ref = RYB.rgb.apply(RYB, point).map(function(x) {
        return Math.floor(255 * x);
    }), r = _ref[0], g = _ref[1], b = _ref[2];
    color = "rgb(" + r + ", " + g + ", " + b + ")";
    return color;
}

google.maps.LatLng.prototype.latRadians = function()
{
    return (Math.PI * this.lat()) / 180;
}

google.maps.LatLng.prototype.lngRadians = function()
{
    return (Math.PI * this.lng()) / 180;
}

function bearing(from, to) {
    var lat1 = from.latRadians();
    var lon1 = from.lngRadians();
    var lat2 = to.latRadians();
    var lon2 = to.lngRadians();
    var angle = - Math.atan2( Math.sin( lon1 - lon2 ) * Math.cos( lat2 ), Math.cos( lat1 ) * Math.sin( lat2 ) - Math.sin( lat1 ) * Math.cos( lat2 ) * Math.cos( lon1 - lon2 ) );
    if ( angle < 0.0 ) angle  += Math.PI * 2.0;
    angle = angle * 180.0 / Math.PI;
    return parseFloat(angle.toFixed(1));
}

function reapDeadVehicles(i) {
    for(id in animInfo) {
        if(lastIndex[id] < i) {
            freeColors.push(animInfo[id].color);
            if(animInfo[id].line)
                animInfo[id].line.setMap(null);
            if(markers[id])
                markers[id].setMap(null);
            delete animInfo[id];
        }
    }
}

var inactivityInterval = 10 * 60 * 1000; // 10 min
function hideInactive(curTime) {
    for(id in animInfo) {
        if(animInfo[id].line && animInfo[id].line.getVisible()) {
            var ts = new Date(animInfo[id].lastUpdate);
            if(curTime - ts > inactivityInterval) {
                if(animInfo[id].line)
                    animInfo[id].line.setVisible(false);
                if(markers[id])
                    markers[id].setMap(null);
                //console.log(id+" went inactive");
            }
        }
    }
}

function rewind(by) {
    curTime = new Date(curTime.getTime() - by);
    while(newISO8601Date(rt[curI].l1ts) > curTime && curI > 0)
        curI--;

    clearAll();
}

function fastForward(by) {
    curTime = new Date(curTime.getTime() + by);
    clearAll();
}

function clearAll() {
    for(id in animInfo) {
        if(animInfo[id].line)
            animInfo[id].line.setMap(null);
    }

    for(id in markers) {
        markers[id].setMap(null);
    }
}

function flashControl(c) {
    c.css('background-color', 'black');
    c.animate({'background-color': 'white'}, 'fast');
}

function createLegend() {
    // Legend on map
    var legendDiv = document.createElement('div');
    legendDiv.id = 'legend';
    legendDiv.style.padding = '5px';
    legendDiv.style.backgroundColor = 'white';
    legendDiv.style.borderStyle = 'solid';
    legendDiv.style.borderWidth = '1px';

    // Current time
    var currentTimeDiv = document.createElement('div');
    currentTimeDiv.id = 'currentTime';
    legendDiv.appendChild(currentTimeDiv);

    // Icon description
    descDiv = document.createElement('div');
    descDiv.id = "desc";
    descDiv.innerHTML = '<table><tr><td><input type="checkbox" id="showStopRequest" checked/></td><td><div class="circle" style="background-color:red"></div></td><td>Stop Request</td></tr><tr><td><input type="checkbox" id="showDoorOpen" checked/></td><td><div class="circle" style="background-color:blue"></div></td><td>Door Open</td></tr></table>';
    legendDiv.appendChild(descDiv);

    // Play/pause controls
    controlsDiv = document.createElement('div');
    controlsDiv.id = "controls";
    controlsDiv.innerHTML = '<div id="rw"><div class="arrow-left"></div><div class="arrow-left"></div></div> <div id="p"><div class="pauserect"></div><div class="pauserect"></div></div> <div id="ff"><div class="arrow-right"></div><div class="arrow-right"></div></div>';
    legendDiv.appendChild(controlsDiv);

    map.controls[google.maps.ControlPosition.TOP].push(legendDiv);

    // rewind button
    $(document).on('click','#controls #rw',function () {
        rewind(1000000);
        runForOne = true;
        flashControl($('#controls #rw'));
    });

    // fastforward button
    $(document).on('click','#controls #ff',function () {
        fastForward(1000000);
        runForOne = true;
        flashControl($('#controls #ff'));
    });
    
    // play/pause button
    $(document).on('click','#controls #p',function () {
        pausing = !pausing;
        if(pausing)
            $('#controls #p').html('<div class="arrow-right"></div>');
        else
            $('#controls #p').html('<div class="pauserect"></div><div class="pauserect"></div>');
        flashControl($('#controls #p'));
    });
    
    // show stop request checkbox
    $(document).on('change','#showStopRequest',function () {
        showStopRequest = $('#showStopRequest').prop('checked');
    });

    // show door open checkbox
    $(document).on('change','#showDoorOpen',function () {
        showDoorOpen = $('#showDoorOpen').prop('checked');
    });

    // give the DOM a chance to get initialized before adding any events
    setTimeout(function() {
        // disable text selection on controls
        $('#legend').live('selectstart dragstart', function(evt){ evt.preventDefault(); return false; });
    }, 1000);
}

function pad2(x) { return (x < 10 ? '0' : '') + x.toString(); }

var pausing = false;
var runForOne = false;
var showDoorOpen = true;
var showStopRequest = true;
var lines = {};
var animInfo = {};
var curTime;
var curI;
var rt;
var progresslen, curprogress;
var allRoutes = {};

function getScript(url,f) {
    var script = document.createElement('script');
    script.setAttribute('type', 'text/javascript');
    script.setAttribute('src', url);
    script.onerror = f; //opts.error;
    var head = document.getElementsByTagName('head')[0];
    head.appendChild( script );
  
    script.onload = script.onreadystatechange = function() {
        if ( !this.readyState || this.readyState == "loaded" || this.readyState == "complete" ) {
            /*
            !!window[opts.objectName] || !opts.objectName
                ? opts.success()
                : opts.error();
            */
            f();
            
            // Handle memory leak in IE
            script.onload = script.onreadystatechange = null;
            head.removeChild( script );
        }
    };
};

function loadScripts(scripts, complete) {
    if (scripts.length > 0) {
        console.log('loading '+scripts[0]);
        var curlen = rtdata.length;
        getScript(scripts[0], function () {
            if(curlen < rtdata.length) {
                // success
                rt = rtdata;
                scripts.shift();
                curprogress++;
                $('#progressbar').progressbar('value', curprogress);
                loadScripts(scripts, complete);
            } else {
                // failure, retry
                console.log('retrying '+scripts[0]);
                setTimeout(function(){loadScripts(scripts, complete);}, 1000);
            }
        });
    } else {
        $('#progressbar').fadeOut('slow');
        complete();
    }
}

function getRouteList() {
    var i, routeList = {};
    for(i in rt) {
        routeList[rt[i].route] = true;
    }
    return routeList;
}

function routeOrder(a, b) {
    var anum = parseInt(getRouteName(a));
    var bnum = parseInt(getRouteName(b));
    if(isNaN(anum) && isNaN(bnum))
        return (getRouteName(a) <= getRouteName(b) ? -1 : 1);
    else if(isNaN(anum) && !isNaN(bnum))
        return 1;
    else if(!isNaN(anum) && isNaN(bnum))
        return -1;
    else if(anum == bnum)
        return (a < b ? -1 : 1);
    else
        return anum - bnum;
}

function createRouteDiv() {
    allRoutes = getRouteList();
    var routeDiv = document.createElement('div');
    routeDiv.id = 'routes';
    routeDiv.style.padding = '5px';
    routeDiv.style.backgroundColor = 'white';
    routeDiv.style.borderStyle = 'solid';
    routeDiv.style.borderWidth = '1px';
    var checkAllDiv = document.createElement('div');
    checkAllDiv.innerHTML = '<input type="checkbox" id="checkall" checked/> <b>All</b>'
    routeDiv.appendChild(checkAllDiv);

    $(document).on('change', '#routes #checkall', function() {
        $('#routes input.route').prop('checked', $('#routes #checkall').prop('checked'));
        $('#routes input.route').change(); // trigger event
    });

    var rl = [];
    for(route in allRoutes) {
        rl.push(route);
    }
    // sort by route name, treating them as numbers before trying as strings
    rl.sort(routeOrder);
    for(r in rl) {
        var route = rl[r];
        var checkDiv = document.createElement('div');
        checkDiv.innerHTML =
            '<input type="checkbox" class="route" id="'+route+'" checked/> '+getRouteName(route);
        routeDiv.appendChild(checkDiv);
        // capture variable route in separate binding, so loop doesn't modify it
        (function(route) {
            $(document).on('change','#routes #'+route, function(){
                //console.log('setting '+route+' to '+$('#routes #'+route).prop('checked'));
                allRoutes[route] = $('#routes #'+route).prop('checked');
            })
        })(route);
    }
    map.controls[google.maps.ControlPosition.RIGHT].push(routeDiv);
}

function createMapOptionsDiv() {
    var optionsDiv = document.createElement('div');
    optionsDiv.id = 'mapOpts';
    optionsDiv.style.padding = '5px';
    optionsDiv.style.backgroundColor = 'white';
    optionsDiv.style.borderStyle = 'solid';
    optionsDiv.style.borderWidth = '1px';
    var showRoutesDiv = document.createElement('div');
    showRoutesDiv.id = 'showRoutes';
    showRoutesDiv.innerHTML = '<input type="checkbox" id="showRoutes" checked/> Show Routes?';
    optionsDiv.appendChild(showRoutesDiv);

    $(document).on('change', '#mapOpts input#showRoutes', function () {
        if($('#mapOpts input#showRoutes').prop('checked'))
            mbtaKeyBusLayer.setMap(map);
        else
            mbtaKeyBusLayer.setMap(null);
    });

    map.controls[google.maps.ControlPosition.RIGHT].push(optionsDiv);    
}

$(document).ready(function() {
    rt = rtdata;

    progresslen = rtscripts.length;
    curprogress = 0;
    $('#progressbar').progressbar({ value: 0, max: progresslen });

    loadScripts(rtscripts, function() { createRouteDiv(); });

    //findLastIndices(rt); // needs to occur after scripts are loaded, but not currently used anyway

    var myOptions = {
        center: boston,
        zoom: 12,
        mapTypeId: google.maps.MapTypeId.ROADMAP
    };
    map = new google.maps.Map(document.getElementById("map_canvas"),
                              myOptions);
    mbtaRTLayer = new google.maps.TransitLayer();
    mbtaRTLayer.setMap(map);
    mbtaKeyBusLayer = new google.maps.KmlLayer("http://walkingbostonian.heliohost.org/MBTA_KeyBusSL_a25.kml");
    mbtaKeyBusLayer.setMap(map);

    createLegend();
    createMapOptionsDiv();

    // initialize
    if(rt.length > 0) {
        curI = 0;
        curTime = newISO8601Date(rt[0].l1ts);
    } else curI = -1; // delay initialization until after load

    var intId = setInterval(function(){
        if(rt.length == 0 || (pausing && !runForOne)) return;
        else if(curI == -1) {
            // delayed initialization
            curI = 0;
            curTime = newISO8601Date(rt[0].l1ts);
        }

        $('#currentTime').text(curTime.toDateString() + ' ' + pad2(curTime.getHours()) + ':' + pad2(curTime.getMinutes()));
        // + ' (i=' + curI + ')');

        // update any arrows that need animating
        for(id in animInfo) {
            if(animInfo[id].secsRem > 0) {
                animInfo[id].secsRem--;
                var icons = animInfo[id].line.get('icons');
                icons[0].offset = Math.min(100, parseFloat(icons[0].offset.slice(0,-1)) + animInfo[id].deltaPercent) + '%';
                animInfo[id].line.set('icons', icons);
            }
        }

        // see what entries are now available at this time
        while(newISO8601Date(rt[curI].l1ts) <= curTime) {
            // process entry curI:
            var id = rt[curI].vehicle;
            var route = rt[curI].route;

            // clear or create an existing animInfo field
            if(animInfo[id]) {
                if(animInfo[id].line)
                    animInfo[id].line.setVisible(false);
            } else {
                animInfo[id] = { secsRem: 0, deltaPercent: 0, line: null, color: null, lastUpdate: null };
            }

            // are we displaying this route?
            if(!(route in allRoutes) || allRoutes[route] == true) {
                // new path formed between l1location and l2location
                var path = [new google.maps.LatLng(rt[curI].l1location[0], rt[curI].l1location[1]),
                            new google.maps.LatLng(rt[curI].l2location[0], rt[curI].l2location[1])];
                
                // time between locations
                var secs = Math.floor((newISO8601Date(rt[curI].l2ts) - newISO8601Date(rt[curI].l1ts)) / 1000);

                // update the animInfo fields

                // setup fields for animation
                animInfo[id].secsRem = secs;
                animInfo[id].deltaPercent = 100.0 / secs;
                animInfo[id].lastUpdate = newISO8601Date(rt[curI].l1ts);

                // update the line object if present
                if(animInfo[id].line) {
                    animInfo[id].line.setPath(path);
                    var icons = animInfo[id].line.get('icons');
                    icons[0].offset = '0%';
                    animInfo[id].line.set('icons', icons);
                    animInfo[id].line.setVisible(true);
                    animInfo[id].line.setMap(map);
                } else {
                    // or create it, with arrow
                    var color = pickColor();
                    var ic = {
                        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                        scale: 3,
                        fillColor: color,
                        fillOpacity: 0.75,
                        strokeColor: 'black',
                        strokeWeight: 1
                    };
                    
                    animInfo[id].line = new google.maps.Polyline({
                        path: path,
                        scale: 0,
                        // invisible line, visible arrow
                        strokeColor: 'rgba(0,0,0,0)',
                        icons: [{
                            icon: ic,
                            // start at 0%: animation increments this to 100%
                            offset: '0%'
                        }],
                        map: map
                    });

                    // track color
                    animInfo[id].color = color;
                }

                // if Door Open or Stop Request entry, then indicate it with temporary marker
                if((rt[curI].l1mtype == "Stop request" && showStopRequest) ||
                   (rt[curI].l1mtype == "Door open" && showDoorOpen)) {
                    var markerOpts = {
                        position: path[0], map: map, flat: true,
                        icon: { path: google.maps.SymbolPath.CIRCLE,
                                fillColor: rt[curI].l1mtype == "Stop request" ? 'red' : 'blue',
                                fillOpacity: 1,
                                scale: 5,
                                strokeWeight: 1 }
                    };
                    if(markers[id]) {
                        markers[id].setOptions(markerOpts);
                    } else {
                        markers[id] = new google.maps.Marker(markerOpts);
                    }
                } else {
                    // clear marker if rt[curI] is location entry
                    if(markers[id])
                        markers[id].setMap(null);
                }
            } else {
                // clear marker if vehicle not visible
                if(markers[id])
                    markers[id].setMap(null);
            }

            // move to next entry
            curI++;
            if(curI >= rt.length) {
                clearInterval(intId); // done
                return;
            }
        }

        // increment curTime by 1 second
        curTime = new Date(curTime.getTime() + 1000);

        hideInactive(curTime);

        //reapDeadVehicles(i); // remove animInfo that will never be updated again

        runForOne = false;
    }, animInterval);
});

/* <!-- Data extraction query that I used to obtain this array -->

CREATE INDEX locations_tripid_idx ON locations(tripid)
CREATE INDEX locations_timestamp_idx ON locations(timestamp)
CREATE INDEX locations_route_idx ON locations(route)

-- ugly but fast

-- key routes:
-- 1, 15, 22, 23, 28, 32, 39, 57, 66, 71, 73, 77, 111, 116, and 117.
-- including CT1 (701)
-- CT2 (747)
-- CT3 (708)
-- SL1 (741)
-- SL2 (742)
-- SL4 (751)
-- SL5 (749)
CREATE OR REPLACE VIEW buskeyroutes_consecutive_locations AS
SELECT l1.tripid, l1.vehicle, l1.route, l1.direction,
       l1.timestamp AS l1ts, l1.latitude AS l1lat, l1.longitude AS l1lon, l1.messageType AS l1mtype,
       l2.timestamp AS l2ts, l2.latitude AS l2lat, l2.longitude AS l2lon, l2.messageType AS l2mtype
FROM (SELECT l1.tripid AS tid,l1.timestamp AS l1ts,min(l2.timestamp) AS l2ts
      FROM locations l1, locations l2
      WHERE l1.route IN ('1','CT1','15','22','23','28','32','39','57','57A','66','71','73','77','111','116','117')
      AND l1.tripid <> 0
      AND l1.timestamp BETWEEN timestamp '2011-10-11 03:20' AND timestamp '2011-10-12 02:00'
      AND l2.route = l1.route
      AND l2.tripid = l1.tripid
      AND l2.timestamp > l1.timestamp
      GROUP BY l1.tripid, l1.timestamp) c
JOIN locations l1 ON l1.tripid = c.tid AND l1.timestamp = c.l1ts
JOIN locations l2 ON l2.tripid = c.tid AND l2.timestamp = c.l2ts

SELECT '{vehicle:"'||vehicle||'",route:"'||route||'",direction:"'||direction||
        '",l1location:['||l1lat||','||l1lon||'],l2location:['||l2lat||','||l2lon||
        '],l1mtype:"'||l1mtype||'",l2mtype:"'||l2mtype||
        '",l1ts:"'||l1ts||'",l2ts:"'||l2ts||'"},'
FROM buskeyroutes_consecutive_locations
ORDER BY l1ts

*/

