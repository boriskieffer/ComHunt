# ComHunt
![ComHunt user interface screenshot](/screenshot/Capture.PNG?raw=true "ComHunt UI screenshot")
Search for YouTube comments and replies under the current video and post. 

Now published! Get it here :
https://addons.mozilla.org/fr/firefox/addon/comhunt/

You can track the development on "dev" branch:
https://github.com/boriskieffer/ComHunt/tree/dev

## Supported languages for now:
- English
- French

## Features
- Deploy comment replies from a parent comment
- Deploy comment thread from a reply
- Like a comment (if logged)
- Highlight results
- Transcript support
- Emoji support
- Markdown support
- Sort by comment length, like count or publication date
- Dark mode support

## Supported comment types :
- Youtube Video
- YouTube Post
- YouTube Shorts

## TODO
- More CPU-efficient highlighting implementation
- Replace "getId()" with actual instance identifier & type

# Known issues
- Highlight may bug
- Comment "search box" may not appear
- On video change, transcript will sometimes append a "undefined" transcription, which will make the comment search input inresponsive due to exception