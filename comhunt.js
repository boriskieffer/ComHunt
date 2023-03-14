let settings = {};
browser.storage.local.get().then(_settings => settings = _settings);
let tabId = null;
let CLIENT_APIKEY = null;
let ytWindowScriptIsLoaded = false;
let initialContinuationToken = null;

function waitForEl(el) {
    return new Promise((resolve, reject) => {
        const intervalId = setInterval(() => {
            if (document.querySelector(el)) {
                clearInterval(intervalId);
                resolve();
            }
        }, 500);
    });
}

String.prototype.replaceAt = function(index, replacement) {
    return this.substring(0, index) + replacement + this.substring(index + replacement.length);
}

function formatDuration(duration) {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = Math.floor(duration % 60);
  
    const formattedMinutes = minutes.toString().padStart(2, '0');
    const formattedSeconds = seconds.toString().padStart(2, '0');
  
    let timestamp = `${formattedMinutes}:${formattedSeconds}`;
  
    if (hours >= 1) {
      const formattedHours = hours.toString().padStart(2, '0');
      timestamp = `${formattedHours}:${timestamp}`;
    }
  
    return timestamp;
}  

function findKeyByValue(obj, val) {
    const [key, value] = Object.entries(obj).find(([key, value]) => value === val) || [];
    return key;
  }

// injects the "youtube_window" script into body
let ytWindowScript = document.createElement('script');
ytWindowScript.type = 'text/javascript';
ytWindowScript.src = browser.runtime.getURL('youtube_window.js');
ytWindowScript.onload = function () {
    ytWindowScriptIsLoaded = true;
    tryGetClientApiKey();
}

// injects the needed css files
let comhuntStyle = document.createElement('link');
comhuntStyle.rel = 'stylesheet';
comhuntStyle.href = browser.runtime.getURL('css/comhunt.css');
document.body.append(comhuntStyle);

// injects remixicon
let remixIcon = document.createElement('link');
remixIcon.rel = 'stylesheet';
remixIcon.href = browser.runtime.getURL('css/remixicon.css');
document.body.append(remixIcon);

function tryGetClientApiKey ()  {
    if (tabId != null && ytWindowScriptIsLoaded) {
        window.postMessage({comhunt_command: 'getApiKey', comhunt_data: { returnToTabId: tabId }})
    }
}

// messages sent from window instance
window.addEventListener('message', function (event) {
    let message = event.data;
    if (!message.comhunt_command) return;
    switch (message.comhunt_command) {
        case 'setApiKey':
            if(message.comhunt_data.to_tabInstance == tabId) {
                CLIENT_APIKEY = message.comhunt_data.apiKey
                doneIfReady();
            }
            break;
        case 'update_settings':
            settings = event.data.comhunt_data;
            break;
    }
});

// messages sent from the background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message.comhunt_command) return;
    
    switch(message.comhunt_command) {
        case 'setTabId':
            tabId = message.comhunt_data.new_tabId;
            // we got the tabId, can put it into our window instance
            ytWindowScript.setAttribute('data-tabId', tabId)
            document.body.append(ytWindowScript);
            doneIfReady();
            break;
        case 'setApiKey':
            CLIENT_APIKEY = message.comhunt_data.apiKey;
            doneIfReady();
            break;
         case 'locationUpdate':
            doneIfReady();
            break;
        case 'update_settings':
            browser.storage.local.get().then(_settings => settings = _settings);
        default:
            console.log('Unknown command', message.comhunt_command)
    }
});

function getCommentTextFromRuns(runs) {
    let finalComment = '';
    // @todo remove \n etc
    runs.forEach(run => {
        finalComment += run.text;
    });
    return finalComment;
}

function renderCommentFromRuns(runs, container) {
    let currentParagraphContainer = document.createElement('p');
    currentParagraphContainer.classList.add('comhunt__commentParagraph');


    let matches = [];
    let search = CommentSearchBoxDOM.searchBox.value;
    let searchIndex = 0;
    
    runs.forEach((run, runIndex) => {
        let runText = run.text;
        let finalRunTextEl;

        if (run.navigationEndpoint != null) {
            let anchor = document.createElement('a');
            anchor.classList.add('comhunt__link');
            if (run.navigationEndpoint.browseEndpoint != null) {
                anchor.href = run.navigationEndpoint.browseEndpoint.canonicalBaseUrl;
            } else {
                anchor.href = run.navigationEndpoint.commandMetadata.webCommandMetadata.url
            }
            anchor.innerText = runText;

            anchor.addEventListener('click', function (evt) {
                evt.preventDefault();
                document.querySelector('video').currentTime = run.navigationEndpoint.watchEndpoint.startTimeSeconds;
            });
            
            finalRunTextEl = anchor;
            currentParagraphContainer.append(anchor);
        }
        
        else if (run.emoji) {
            let img = document.createElement('img');
            img.src = run.emoji.image.thumbnails[0].url;
            img.classList.add('comhunt__commentParagraph');
            img.classList.add('comhunt__commentEmoji');
            img.alt = runText;
            finalRunTextEl = img;
            currentParagraphContainer.append(img);
        }
        
        else {
            if (runText != '\n') {
                let span = document.createElement('span');
                span.innerText = runText;

                if (run.bold || run.italics || run.strikethrough) {
                    span.classList.add('yt-formatted-string');
                    if (run.bold) span.classList.add('bold');
                    if (run.strikethrough) span.classList.add('strikethrough');
                    if (run.italics) span.classList.add('italic');
                }

                finalRunTextEl = span;
                currentParagraphContainer.append(span)

            }
            // is a new line
            else {
                container.append(currentParagraphContainer);
                currentParagraphContainer = document.createElement('p');
                currentParagraphContainer.classList.add('comhunt__commentParagraph');
            }
        }

        // highlight
        if (settings.enable_highlight) {
            for (var runCharIndex=0; runCharIndex<runText.length; runCharIndex++) {
                if (runText[runCharIndex].toLowerCase() == search[searchIndex].toLowerCase()) {

                    if (searchIndex < search.length-1) {
                        let currentEl = matches.filter(element => element.el == finalRunTextEl)[0];
                        if (!currentEl) {
                            matches.push({
                                el: finalRunTextEl,
                                startIdx: runCharIndex
                            });
                        } else {
                            currentEl.endIdx = runCharIndex;
                        }

                        searchIndex++;
                    } else {
                        highlight(matches);
                        searchIndex = 0;       
                        matches = [];                 
                    }
                } else { // non-contiguous
                    searchIndex = 0;
                    matches = [];
                }

            }
        }

        if (runIndex+1 == runs.length) {
            container.append(currentParagraphContainer);
        }
    });

}

function highlight (matches) {
    matches.forEach(match => {
        const startIdx = match.startIdx;
        const endIdx   = match.endIdx +2 || startIdx.startIdx +1;
        const text     = match.el.textContent;

        const startTxt = text.substring(0, startIdx);
        const markTxt  = text.substring(startIdx, endIdx);
        const endTxt   = text.substring(endIdx);

        const markEl = document.createElement('mark');
        markEl.textContent = markTxt;

        match.el.textContent = null;
        match.el.append(startTxt, markEl, endTxt);
    })
}

var CommentSearchBoxDOM = {
    YT_Video_instance: false,
    YT_Post_instance: false,
    loadCounter: 0, // current comment requests count
    instanceInitialToken: null, // used to reset instance and cancel currently loading things
    searchBox: null,
    transcripts: [],
    comments: [],
    resList: null,
    replySetContainer: {},
    videoAuthorProfilePicture: null, 

    createInstance: function (parentContainer, beforeContainer) {
        this.appContainer = document.createElement('div');
        this.appContainer.classList.add('comhunt__appContainer');

        // <table>
        let loadingTable = document.createElement('table');
        
        // <table><tr>
        let loadingTable__commentsRow = document.createElement('tr');

        // <table><tr><td>
        this.loadingTable__commentsRow__icon = document.createElement('td');
        this.loadingTable__commentsRow__icon.style.fontSize = '18px';
        this.loadingTable__commentsRow__icon.classList.add('ri-chat-download-fill');
        this.loadingTable__commentsRow__icon.classList.add('blink');
        // <table><tr><td>
        let loadingTable__commentsRow__title = document.createElement('td');
        loadingTable__commentsRow__title.innerText = browser.i18n.getMessage('COMMENTS');
        // <table><tr><td>
        this.loadingTable__commentsRow__data = document.createElement('td');
        this.loadingTable__commentsRow__data.innerText = '0'
        // inserts x3 <table><tr><td> 
        loadingTable__commentsRow.append(this.loadingTable__commentsRow__icon, loadingTable__commentsRow__title, this.loadingTable__commentsRow__data)

        // <table><tr>
        let loadingTable__transcriptionRow = document.createElement('tr');

        // <table><tr><td>
        this.loadingTable__transcriptionRow__icon = document.createElement('td');
        this.loadingTable__transcriptionRow__icon.style.fontSize = '18px';
        this.loadingTable__transcriptionRow__icon.classList.add('ri-chat-download-fill');
        this.loadingTable__transcriptionRow__icon.classList.add('blink');
        // <table><tr><td>
        let loadingTable__transcriptionRow__title = document.createElement('td');
        loadingTable__transcriptionRow__title.innerText = browser.i18n.getMessage('TRANSCRIPT');
        // <table><tr><td>
        this.loadingTable__transcriptionRow__data = document.createElement('td');
        this.loadingTable__transcriptionRow__data.innerText = '0'
        // inserts x3 <table><tr><td> 
        loadingTable__transcriptionRow.append(this.loadingTable__transcriptionRow__icon, loadingTable__transcriptionRow__title, this.loadingTable__transcriptionRow__data)
        
        // inserts x2 <table><tr>
        loadingTable.append(loadingTable__commentsRow, loadingTable__transcriptionRow);

        // inserts <table>
        this.appContainer.append(loadingTable);

        this.resList = document.createElement('div');
        this.resList.classList.add('comhunt__resultListContainer');

        let headerStatus = document.createElement('div');

        let commentCountContainer = document.createElement('div');

        // Sort input in "headerStatus" div
        sortField = document.createElement('select');

        let sortOpt__description = document.createElement('option');
        sortOpt__description.innerText = browser.i18n.getMessage('SORT_DESCRIPTION');

        let sortOpt__commentLength = document.createElement('option');
        sortOpt__commentLength.innerText = browser.i18n.getMessage('SORTBY_COMMENT_LENGTH');

        let sortOpt__commentDate = document.createElement('option');
        sortOpt__commentDate.innerText = browser.i18n.getMessage('SORTBY_COMMENT_DATE');

        let sortOpt__likeCount = document.createElement('option');
        sortOpt__likeCount.innerText = browser.i18n.getMessage('SORTBY_LIKE_COUNT');
        
        sortField.append(sortOpt__description, sortOpt__commentLength, sortOpt__commentDate, sortOpt__likeCount);

        let sortType = document.createElement('select');

        let sortTypeOpt__description = document.createElement('option');
        sortTypeOpt__description.innerText = browser.i18n.getMessage('SORT_TYPE_DESCRIPTION');
        let sortTypeOpt__ASC = document.createElement('option');
        sortTypeOpt__ASC.innerText = browser.i18n.getMessage('SORT_TYPE_ASC');
        let sortTypeOpt__DESC = document.createElement('option');
        sortTypeOpt__DESC.innerText = browser.i18n.getMessage('SORT_TYPE_DESC');

        sortType.append(sortTypeOpt__description, sortTypeOpt__ASC, sortTypeOpt__DESC);

        let sortFieldList = {
            'commentLength': sortOpt__commentLength,
            'commentDate': sortOpt__commentDate,
            'likeCount': sortOpt__likeCount
        }

        sortField.addEventListener('change', () => {
            let ascending = sortType.selectedOptions[0] == sortTypeOpt__ASC;
            let sortFieldName = findKeyByValue(sortFieldList, sortField.selectedOptions[0])
            this.sortComments(sortFieldName, ascending);
        })

        sortType.addEventListener('change', () => {
            let ascending = sortType.selectedOptions[0] == sortTypeOpt__ASC;
            let sortFieldName = findKeyByValue(sortFieldList, sortField.selectedOptions[0])
            this.sortComments(sortFieldName, ascending);
        })

        // append to header sortfield and commentcount container
        headerStatus.append(sortField, sortType)
        headerStatus.append(commentCountContainer);

        this.searchBox = document.createElement('input');
        this.searchBox.placeholder = browser.i18n.getMessage("searchBox");
        this.searchBox.classList.add('comhunt__searchBox');

        this.searchBox.addEventListener('keypress', (event) => {
            if (event.key === "Enter") {
                let results = this.comments.filter(
                    commentData => {
                        let searchInput = !settings.enable_caseSensitive ? this.searchBox.value.toLowerCase() : this.searchBox.value;
                        let commentText = !settings.enable_caseSensitive ? getCommentTextFromRuns(commentData.commentRuns).toLowerCase() : getCommentTextFromRuns(commentData.commentRuns);
                        let authorName = !settings.enable_caseSensitive ? commentData.authorName.toLowerCase() : commentData.authorName;
                        return commentText.includes(searchInput) || authorName.includes(searchInput);
                    }
                );

                let transcriptResults = this.transcripts.filter(
                    transcript => {
                        let searchInput = !settings.enable_caseSensitive ? this.searchBox.value.toLowerCase() : this.searchBox.value;
                        return !settings.enable_caseSensitive ? transcript.transcriptText.toLowerCase().includes(searchInput) : transcript.transcriptText.includes(searchInput)
                    }
                );

                console.log('calling renderCommentSet on', results);
                this.renderCommentSet(results, this.searchBox.value);
                
                this.renderTranscriptSet(transcriptResults);
            }
        });

        this.appContainer.append(headerStatus);
        this.appContainer.append(this.searchBox);
        this.appContainer.append(this.resList);

        parentContainer.insertBefore(this.appContainer, beforeContainer);
        this.YT_Video_instance = true;
    },
    sortComments(sortFieldName, ascending = false) {
        switch (sortFieldName) {
            case 'commentLength':
                this.comments.sort((comment1, comment2) => {
                    // scope parents only
                    if (ascending) {
                        return (getCommentTextFromRuns(comment1.commentRuns).length - getCommentTextFromRuns(comment2.commentRuns).length)
                    } else {
                        return (getCommentTextFromRuns(comment2.commentRuns).length - getCommentTextFromRuns(comment1.commentRuns).length);
                    }
                });
                break;
            case 'commentDate':
                this.comments.sort((comment1, comment2) => {
                    // scope parents only
                    if (ascending) {
                        return comment1.index - comment2.index;
                    } else {
                        return comment2.index - comment1.index;
                    }
                });
                break;
            case 'likeCount':
                this.comments.sort((comment1, comment2) => {
                    // scope parents only
                    if (ascending) {
                        return comment1.voteCount - comment2.voteCount;
                    } else {
                        return comment2.voteCount - comment1.voteCount;
                    }
                });
                break;
        }
    },
    resetInstance: function () {
        this.comments = [];
        this.replySetContainer = {};
        
        let _resList = document.createElement('div');
        _resList.classList.add('comhunt__resultListContainer');
        this.resList.replaceWith(_resList);
        this.resList = _resList;
    },
    transformReplyIntoThread: function (thread, parentId, highlightCommentId) {
        this.renderCommentSet(thread, null, null, {
            parentId,
            highlightCommentId
        });
    },
    transformThreadIntoReply: function (replyData, commentContainer) {
        let newCommentContainer = document.createElement('div');
        newCommentContainer.style.margin = '15px 0';

        commentContainer.replaceWith(newCommentContainer);
        
        this.renderComment(newCommentContainer, replyData, {operation: 'renderReply'})
    },

    // renders the comment, could be a parent comment or a reply
    // parentElement is either resList (result list) or a parent comment containing replies
    // renderType is the type of rendered comment => parentComment | threadFromParentComment | threadFromReply
    // @todo commentSettings.operation should be an argument here.. maybe call it "renderType" to make it more clear
    renderComment: function (parentElement, commentData, commentSettings = {}) {
        let commentContainer = document.createElement("div");
        commentContainer.classList.add('comhunt__commentContainer');

        if (commentSettings.operation == 'showThreadFromReply' && commentData.commentId == commentSettings.highlightReplyId) {
            commentContainer.classList.add('comhunt__activeComment')
        }

        let repliesContainer = document.createElement('div');
        repliesContainer.classList.add('comhunt__repliesContainer');    

        // Author profile picture
        let profilePicture = document.createElement('img');
        profilePicture.classList.add('comhunt__profilePicture');
        profilePicture.src = commentData.authorThumbnail;

        commentContainer.append(profilePicture);

        // Wraps everything except image
        let commentDetailsContainer = document.createElement('div');
        commentDetailsContainer.style.float = 'left';
        commentDetailsContainer.style.width = 'calc(100% - 55px)';

        // Top bar, with author name and date
        let topTitle = document.createElement('div')

        let authorName = document.createElement('a');
        authorName.classList.add('comhunt__authorName');
        authorName.href = commentData.authorChannel;
        authorName.innerText = commentData.authorName;
        topTitle.append(authorName)

        let commentDateText = document.createElement('a');
        commentDateText.href = window.location + '&lc=' + commentData.commentId;
        commentDateText.innerText = commentData.timeText;
        commentDateText.classList.add('comhunt__commentDateText');
        topTitle.append(commentDateText);

        commentDetailsContainer.append(topTitle)

        // Comment text itself
        let commentTextContainer = document.createElement('div');
        commentTextContainer.classList.add('comhunt__commentTextContainer');
        renderCommentFromRuns(commentData.commentRuns, commentTextContainer, this.searchBox.value);

        commentDetailsContainer.append(commentTextContainer)

        // append the author details container to the wrapper
        commentContainer.append(commentDetailsContainer)

        // clearfix
        let clearFix = document.createElement('div');
        clearFix.style.clear = 'both';
        commentContainer.append(clearFix);

        // bottom bar, likes, video owner heart..
        let bottomBar = document.createElement('div')
        bottomBar.style.marginTop = '5px';

        let likeCountContainer = document.createElement('div');
        likeCountContainer.title = browser.i18n.getMessage('likeCount', commentData.voteCount)

        let likeCountIcon = document.createElement('i');
        likeCountIcon.classList.add('comhunt_icon');
        likeCountIcon.classList.add('ri-thumb-up-line')
        likeCountIcon.style.marginRight = '4px';
        likeCountIcon.style.color = '#606060';
        likeCountContainer.append(likeCountIcon);

        let likeCountTxt = document.createElement('span')
        likeCountTxt.innerText = commentData.voteCount;
        likeCountTxt.style.fontSize = '12px';
        likeCountTxt.style.verticalAlign = 'middle';
        likeCountTxt.style.color = '#606060';
        likeCountContainer.append(likeCountTxt);

        likeCountContainer.classList.add('comhunt__comment_bottomBar_item')
        bottomBar.append(likeCountContainer)

        if (commentData.isHearted) {
            let heartedByAuthorContainer = document.createElement('div');
            heartedByAuthorContainer.classList.add('comment_hearted_author_container');
            heartedByAuthorContainer.title = browser.i18n.getMessage('heartedByVideoOwner');

            let heartedByAuthorImg = document.createElement('img');
            heartedByAuthorImg.src = this.videoAuthorProfilePicture;
            heartedByAuthorImg.classList.add('comhunt__hearted_author_img')

            let heartedByAuthorIcon = document.createElement('i');
            heartedByAuthorIcon.classList.add('ri-heart-fill');
            heartedByAuthorIcon.classList.add('comhunt__hearted_author_icon');

            heartedByAuthorContainer.append(heartedByAuthorImg, heartedByAuthorIcon);
            heartedByAuthorContainer.classList.add('comhunt__comment_bottomBar_item')

            bottomBar.append(heartedByAuthorContainer);
        }

        commentDetailsContainer.append(bottomBar);

        // if it's a parent comment AND the thread is not deployed from a reply
        if (commentData.parentId == null) {
            let replies = this.comments.filter(comment => comment.parentId == commentData.commentId);

            if (replies.length > 0){
                let buttonText = {
                    show: replies.length == 1 ? '↳ Show the reply' : ('↳ Show all  ' + replies.length + ' replies'),
                    hide: replies.length == 1 ? 'Hide reply' : 'Hide all replies'
                };

                let showRepliesButton = document.createElement('button');

                showRepliesButton.classList.add('comhunt__feedbackBtn');

                showRepliesButton.addEventListener('click', () => {
                    commentData.isThreadShown = !commentData.isThreadShown;

                    if (commentData.isThreadShown) {
                        commentContainer.append(repliesContainer);
                        this.replySetContainer[commentData.commentId] = repliesContainer;
                        this.renderCommentSet(replies, this.searchBox.value, repliesContainer, {
                            operation: 'showAllReplies'
                        })
                        showRepliesButton.innerText = buttonText.hide;
                    } else {
                        // destroy every dom elements of threadreplies for the "commentData.commentId"
                        showRepliesButton.innerText = buttonText.show;

                        // @todo ugly, to replace
                        repliesContainer = document.createElement('div');
                        repliesContainer.classList.add('comhunt__repliesContainer');    

                        this.destroyReplySetContainer(commentData.commentId);
                    }
                });

                showRepliesButton.innerText = buttonText.show;
                if (commentSettings.operation != 'showThreadFromReply') {
                    commentContainer.append(showRepliesButton);
                }
            }

            // since parentId is null so it's a parent comment, append it to the root container (resList)
            if (commentSettings.replacesContainer == null){
                this.resList.append(commentContainer);
            } else {
                commentSettings.replacesContainer.replaceWith(commentContainer)
            }
            
        } else  {
            // append the comment container to the replies container
            if (commentSettings.operation != 'showAllReplies') { 
                let showThreadButton = document.createElement('button');
                showThreadButton.classList.add('comhunt__feedbackBtn');

                let buttonText = {
                    show: 'Show entire thread',
                    hide: 'Hide thread'
                };

                showThreadButton.addEventListener('click', () => {
                    let parentComment = this.comments.filter(comment => comment.commentId == commentData.parentId)[0];
                    commentData.isThreadShown = !commentData.isThreadShown;

                    if (commentData.isThreadShown && commentSettings.operation != 'showThreadFromReply') {
                        this.renderComment(null, parentComment, {
                            operation: 'showThreadFromReply',
                            highlightReplyId: commentData.commentId,
                            x: 'y',
                            replacesContainer: commentContainer
                        });

                        showThreadButton.innerText = buttonText.hide;
                    } else {
                        // hide the thread
                        this.transformThreadIntoReply(commentData, commentSettings.threadContainer);
                    }
                });

                // since the thread is already shown (operation is showThreadFromReply) display "hide button"
                if (commentSettings.operation == 'showThreadFromReply') {
                    showThreadButton.innerText = buttonText.hide;
                } else {
                    showThreadButton.innerText = buttonText.show;
                }

                if (commentSettings.operation != 'showThreadFromReply' || commentData.commentId == commentSettings.highlightReplyId) {
                    commentContainer.append(showThreadButton);
                }
            }

            // commentSettings.threadContainer est appelé la 2nd fois..
            parentElement.append(commentContainer)
            
        }

        // reply has been replaced with its parent comement, now expand the whole thread
        if (commentSettings.operation == 'showThreadFromReply' && commentSettings.threadContainer == null) {
            let thread = this.comments.filter(comment => comment.parentId == commentData.commentId)

            commentContainer.append(repliesContainer);
            this.replySetContainer[commentData.commentId] = repliesContainer;

            this.renderCommentSet(thread, this.searchBox.value, repliesContainer, {
                operation: 'showThreadFromReply',
                threadContainer: commentContainer,
                highlightReplyId: commentSettings.highlightReplyId
            })
        }
        
    },
    destroyReplySetContainer: function (commentId) {
        if (this.replySetContainer[commentId] != null && this.replySetContainer[commentId].parentNode) {
            this.replySetContainer[commentId].parentNode.removeChild(this.replySetContainer[commentId]);
        }
    },
    setLoadingComplete: function (iconContainer, loadingComplete = true, error = false) {
        console.log(iconContainer,'=>',iconContainer.classList);

        if (loadingComplete) {
            iconContainer.classList.remove('ri-chat-download-fill')
            iconContainer.classList.remove('blink')
        }

        if(!error){
            if (loadingComplete) {
                iconContainer.classList.add('ri-chat-check-fill');
                iconContainer.classList.add('is-done-color');
            } else {
                // remove loading complete
            }
        } else {
            iconContainer.classList.add('ri-chat-off-line');
            iconContainer.classList.add('is-done-error-color');
        }

    },
    renderTranscriptSet: function (transcriptSet) {
        console.log('[.renderTranscriptSet] on ', transcriptSet)
        transcriptSet.forEach(transcript => {
            let commentContainer = document.createElement("div");
            commentContainer.classList.add('comhunt__commentContainer');

            let transcriptGoto = document.createElement('a');
            transcriptGoto.style.fontSize = '13px';
            transcriptGoto.classList.add('comhunt__link');
            transcriptGoto.innerText = '[transcript] ' + formatDuration(transcript.start);
            transcriptGoto.addEventListener('click', function () {
                document.querySelector('video').currentTime = transcript.start;
            });

            let transcriptParagraphContainer = document.createElement('div');
            transcriptParagraphContainer.classList.add('comhunt__commentTextContainer');
            
            let transcriptParagraph = document.createElement('p');
            transcriptParagraph.classList.add('comhunt__commentTextContainer');
            transcriptParagraph.innerText = transcript.transcriptText;
            transcriptParagraphContainer.append(transcriptParagraph);

            commentContainer.append(transcriptGoto, transcriptParagraphContainer);

            this.resList.append(commentContainer);
        })
    },
    // @todo parameters docs
    renderCommentSet: function (commentSet, search, commentContainer = this.resList, commentSettings) {
        console.log('[.renderCommentSet] rendering commentSet', commentSet, 'on', commentContainer, 'with commentsSettings', commentSettings)
        let title = document.createElement('h3');
        title.classList.add('comhunt__resultCount');

        if (commentSet.length > 1) {
            title.innerText = browser.i18n.getMessage("multipleResultMsg", commentSet.length);
        } else if (commentSet.length == 1) {
            title.innerText = browser.i18n.getMessage("singleResultMsg");
        } else {
            title.innerText =  browser.i18n.getMessage("noResult")
        }

        // If rendering on the resList div (root container), reset it
        if (commentContainer == this.resList) {
            this.resList.replaceChildren(); // reset results ; firefox version >= 78
            this.resList.append(title);
        }

        commentSet.forEach(comment => {
            this.renderComment(commentContainer || this.resList, comment, commentSettings)                
        });
    },
    refreshCommentCount: function () {
        this.loadingTable__commentsRow__data.innerText = this.comments.length;
    },
    loadVideoTranscript(videoId) {
        fetch("https://www.youtube.com/youtubei/v1/player?key=" + CLIENT_APIKEY + "&prettyPrint=false", {
            "body": "{\"context\":{\"client\":{\"hl\":\"" + navigator.language + "\",\"clientName\":\"WEB\",\"clientVersion\":\"2.20230309.08.00\"},\"adSignalsInfo\":{\"params\":[]}},\"videoId\":\"" + videoId+ "\"}",
            "method": "POST"
        }).then(response => {
            response.json().then(json => {
                if (json.captions) {
                    let captionUrl = json.captions.playerCaptionsTracklistRenderer.captionTracks[0].baseUrl;
                    captionUrl += '&fmt=json3';
    
                    fetch(captionUrl).then(response => {
                        response.json().then(jsonTranscript => {
                            jsonTranscript.events.forEach(transcriptData => {
                                if (transcriptData.segs && transcriptData.segs.length>1) {  
                                    let transcriptText = '';
                                    transcriptData.segs.forEach(segment => {
                                        transcriptText += segment.utf8;
                                    });
            
                                    this.transcripts.push({
                                        transcriptText,
                                        start: (transcriptData.tStartMs / 1000)
                                    })
                                }
                            })
                            this.setLoadingComplete(this.loadingTable__transcriptionRow__icon, true);
                            this.loadingTable__transcriptionRow__data.innerText = this.transcripts.length + ' (' + json.captions.playerCaptionsTracklistRenderer.captionTracks[0].name.simpleText + ')';
                        })
                    });
                } else {
                    CommentSearchBoxDOM.setLoadingComplete(CommentSearchBoxDOM.loadingTable__transcriptionRow__icon, true, true)
                }
            })
        });
        
        
    },
    pushComment: function (commentId, isChannelOwner, authorName, authorChannel, authorThumbnail, timeText, commentRuns, parentId, isHearted, isPinned, voteCount) {
        if (authorName == null) {
            authorName = ' ';
        }
        let index;
        if (parentId) {
            let parentComment = this.comments.filter(comment => comment.commentId == parentId)[0];
            index = parentComment.commentId +1;
        } else {
            index = this.comments.length
        }

        this.comments.push({
            commentId,
            isChannelOwner,
            authorChannel,
            authorThumbnail,
            authorName,
            timeText,
            commentRuns,
            parentId,
            isHearted,
            isPinned,
            voteCount,
            index
        });
        this.refreshCommentCount();
    }
}

// Loads comment set with continuationtoken or replyset
function load (initialContinuationToken, continuationToken, CLIENT_APIKEY, isReplySet = false, parentId = null) {
    let apiEndpoint = null;
    if (CommentSearchBoxDOM.YT_Video_instance) {
        apiEndpoint = 'https://www.youtube.com/youtubei/v1/next?key=';
    } else if (CommentSearchBoxDOM.YT_Post_instance) {
        apiEndpoint = 'https://www.youtube.com/youtubei/v1/browse?key=';
    } else {
        console.log('Unknown instance type!');
        return;
    }

    if (initialContinuationToken == this.instanceInitialToken) {
        fetch(apiEndpoint + CLIENT_APIKEY + "&prettyPrint=false", {
            "body": "{\"context\":{\"client\":{\"hl\":\"" + navigator.language + "\",\"clientName\":\"WEB\",\"clientVersion\":\"2.20230221.06.00\"}},\"continuation\":\"" + continuationToken + "\"}",
            "method": "POST",
            "mode": "cors"
        }).then(response => {
            response.json().then(json => {
                
                if (json.onResponseReceivedEndpoints == null) {
                    this.refreshCommentCount();
                    return;
                }

                let continuationItems = null;
                if (json.onResponseReceivedEndpoints[1] != null) {
                    continuationItems = json.onResponseReceivedEndpoints[1].reloadContinuationItemsCommand.continuationItems;
                } else {
                    continuationItems = json.onResponseReceivedEndpoints[0].appendContinuationItemsAction.continuationItems;
                }

                if (continuationItems != null) {
                    continuationItems.forEach(continuationItem => {
                        let comment = null;

                        // if it's a parent comment
                        if (continuationItem.commentThreadRenderer != null) {
                            comment = continuationItem.commentThreadRenderer.comment.commentRenderer;

                            // load replies using token if got any replies
                            if (continuationItem.commentThreadRenderer.replies != null) {
                                load(initialContinuationToken, continuationItem.commentThreadRenderer.replies.commentRepliesRenderer.contents[0].continuationItemRenderer.continuationEndpoint.continuationCommand.token, CLIENT_APIKEY, true, comment.commentId)
                                CommentSearchBoxDOM.loadCounter++;
                            }
                        }
                        // otherwise it's probably a reply
                        else if (isReplySet && continuationItem.commentRenderer != null) {
                            comment = continuationItem.commentRenderer;
                        }

                        // append the comment
                        if (comment != null) {

                            let commentRuns = comment.contentText.runs;
                            let isChannelOwner = comment.authorIsChannelOwner;
                            let authorName = comment.authorText.simpleText;
                            let authorChannel = comment.authorEndpoint.browseEndpoint.canonicalBaseUrl;
                            let timeText = comment.publishedTimeText.runs[0].text;
                            let commentId = comment.commentId;
                            let voteCount = comment.voteCount != null ? comment.voteCount.simpleText : 0;
                            let isHearted = comment.actionButtons != null && comment.actionButtons.commentActionButtonsRenderer.creatorHeart != null;
                            let isPinned = comment.pinnedCommentBadge != null;
                            let authorThumbnail = comment.authorThumbnail.thumbnails[0].url; // 48x48 profile picture

                            if (isHearted) {
                                let videoOwnerThumbnail = comment.actionButtons.commentActionButtonsRenderer.creatorHeart.creatorHeartRenderer.creatorThumbnail.thumbnails[0].url;
                                if (CommentSearchBoxDOM.videoAuthorProfilePicture == null || CommentSearchBoxDOM.videoAuthorProfilePicture != videoOwnerThumbnail) {
                                    CommentSearchBoxDOM.videoAuthorProfilePicture = videoOwnerThumbnail;
                                }
                            }

                            CommentSearchBoxDOM.pushComment(
                                commentId,
                                isChannelOwner,
                                authorName,
                                authorChannel,
                                authorThumbnail,
                                timeText,
                                commentRuns,
                                parentId,
                                isHearted,
                                isPinned,
                                voteCount
                            );
                        }

                        // generally contains token for loading next comments (next "page"), if it doesn't then it's the end of loading comments??
                        else if (continuationItem.continuationItemRenderer != null) {
                            if (continuationItem.continuationItemRenderer.trigger == 'CONTINUATION_TRIGGER_ON_ITEM_SHOWN') {
                                let nextContinuationToken = continuationItem.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
                                load(initialContinuationToken, nextContinuationToken, CLIENT_APIKEY, false, null);
                                CommentSearchBoxDOM.loadCounter++;
                            }

                            // probably "show more" button
                            else if (continuationItem.continuationItemRenderer.button != null) {
                                load(initialContinuationToken, continuationItem.continuationItemRenderer.button.buttonRenderer.command.continuationCommand.token, CLIENT_APIKEY, true, parentId);
                                CommentSearchBoxDOM.loadCounter++;
                            }
                        }
                    });

                    // checks if the last element of continuationItems is a commentThreadRenderer.. if so, then it means that all parent comments finished loaded since it has no token for last element
                    if (CommentSearchBoxDOM.loadCounter <= 0) {
                        CommentSearchBoxDOM.setLoadingComplete(CommentSearchBoxDOM.loadingTable__commentsRow__icon,true);
                    } 
                    CommentSearchBoxDOM.loadCounter--;
                }
            });
        });
    } 
}

function initialTokenLoad (continuationToken = null) {
    this.instanceInitialToken = continuationToken;
    console.log('[.initialLoad] Loading with token', instanceInitialToken)

    // when sorting from newest to older instead of top comments, all comments display correctly... ??
    this.instanceInitialToken = this.instanceInitialToken.replaceAt(47, 'B')

    load(this.instanceInitialToken, this.instanceInitialToken, CLIENT_APIKEY, false, null)
}

const getInitialTokenFromVideoId = (videoId) => new Promise((resolve) => {
    fetch("https://www.youtube.com/youtubei/v1/next?key=" + CLIENT_APIKEY + "&prettyPrint=false", {
        "body": "{\"context\":{\"client\":{\"clientName\":\"WEB\",\"clientVersion\":\"2.20230301.09.00\"}},\"videoId\":\"" + videoId + "\"}",
        "method": "POST",
        "mode": "cors"
    }).then(response => {
        try {
            response.json().then(json => {
                console.log(json);
                continuationToken = json.contents.twoColumnWatchNextResults.results.results.contents.filter(
                    renderer => renderer.itemSectionRenderer != null && renderer.itemSectionRenderer.sectionIdentifier == 'comment-item-section'
                );
                continuationToken = continuationToken[continuationToken.length-1].itemSectionRenderer.contents;
                continuationToken = continuationToken[continuationToken.length-1].continuationItemRenderer.continuationEndpoint.continuationCommand.token;    
                resolve(continuationToken)
            })
        } catch {
            alert('ComHunt -- Error when getting initial token')
        }
    });
});

function doneIfReady () {
    if (tabId != null && CLIENT_APIKEY != null) {
        waitForEl("ytd-item-section-renderer").then(() => {
            if (!CommentSearchBoxDOM.YT_Video_instance) {
                console.log('Creating Video_instance');
                CommentSearchBoxDOM.createInstance(document.querySelector("#below"), document.querySelector('ytd-comments'));
                CommentSearchBoxDOM.YT_Post_instance = false;
                CommentSearchBoxDOM.YT_Video_instance = true;
            } else {
                CommentSearchBoxDOM.resetInstance();
            }
            
            let videoId = new URLSearchParams(window.location.search).get('v');
            getInitialTokenFromVideoId(videoId).then(token => {
                initialTokenLoad(token);
            });
            CommentSearchBoxDOM.loadVideoTranscript(videoId);
        });

    }
}