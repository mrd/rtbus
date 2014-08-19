#!/bin/bash

split -d -l 24120 rtkeyroutes_all.txt rtkeyroutes_
for f in rtkeyroutes_??; do
  echo $f
  echo "rtdata = rtdata.concat([" > $f.js
  cat $f >> $f.js
  echo "]);" >> $f.js
done

