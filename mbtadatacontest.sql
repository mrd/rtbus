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

