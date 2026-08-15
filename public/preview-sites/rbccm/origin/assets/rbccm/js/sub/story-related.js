function getLink(path) {
    var dcr = path.split("dcr=")[1];
    if (dcr.charAt(0) == '/') {
        dcr = dcr.substring(1);
    }
    var pathArr = dcr.split("/");
    switch (pathArr[2]) {
        case "insights": return "/en/insights/story.page?dcr=" + dcr;
        case "citizenship": return "/en/citizenship/story.page?dcr=" + dcr;
        case "news": return "/en/about-us/story.page?dcr=" + dcr;
        case "casestudy": return "/en/expertise/study.page?dcr=" + dcr;        
        case "podcast": return "/en/insights/industries-in-motion/podcast.page?dcr=" + dcr;
        case "episode": return "/en/story/" + pathArr[4] + "/" + pathArr[5] + "/" + pathArr[6];
		default: return "/en/insights/" + pathArr[4] + "/" + pathArr[5] + "/" + pathArr[6];
    }

    return path;
}
function loadFooterRelated(stories) {
    var ftemplate = $.templates("#footerTmpl");
 var relThSel = $('.article-img-sel').text();


    var storydata = [];
    var requests = [];

    for (var i = 0; i < stories.length; i++) {
        requests.push($.ajax({
            url: "/rundle/details.page?dcr=" + stories[i], success: function (data) {

                var str = $(data).find("description").text();
                if (str.length > 149 ) { str = str.substring(0, 149) + "..."; }
                var story = {
                    "tag": $(data).find("subcategory").text(),
                    "title": $(data).find("title").text(),
                    "watch_time": $(data).find("time_to_watch").text(),
                    "time": $(data).find("time_to_read").text(),
                    "thumbnail": $(data).find("thumbnail").text(),
                    "story_type": $(data).find("story_type").text(),
                    "description": str,
                    "template_type": $(data).find("Type").text(),
                    "path": getLink(this.url)
                };
                if ($(data).find("link").text()) {
                    story.path = $(data).find("link").text();
                }
               
              
                storydata.push(story);
            }
        }));
    }
    $.when.apply($, requests).done(function () {
        var fHtmlOutput = ftemplate.render(storydata);
        $("#related-footer").html(fHtmlOutput);
    });
}
function loadSidebarRelated(stories) {
    var template = $.templates("#relatedTmpl");
    var firststory = {};
    var storydata = [];
    var requests = [];
     var relThSel = $('.article-img-sel').text();

    for (var i = 0; i < stories.length; i++) {
        if (i == 0) {
            requests.push($.ajax({
                url: "/rundle/details.page?dcr=" + stories[i], success: function (data) {

                    console.log(this);
                    var story = {
                        "tag": $(data).find("subcategory").text(),
                        "title": $(data).find("title").text(),
                        "watch_time": $(data).find("time_to_watch").text(),
                        "time": $(data).find("time_to_read").text(),
                        "thumbnail": $(data).find("thumbnail").text(),
                        "story_type": $(data).find("story_type").text(),
                        "description": $(data).find("description").text(),
                        "template_type": $(data).find("Type").text(),
                        "path": getLink(this.url),
                        "thImgSel": relThSel
                    };
                    if ($(data).find("link").text()) {
                        story.path = $(data).find("link").text();
                    }
              
                   console.log("thumbnail-img-sel" ,relThSel );
                    firststory = story;
                   console.log(firststory);
                }
            }));
                
        }
        else {
            requests.push($.ajax({
                url: "/rundle/details.page?dcr=" + stories[i], success: function (data) {
                    var story = {
                        "tag": $(data).find("subcategory").text(),
                        "title": $(data).find("title").text(),
                        "time": $(data).find("time_to_read").text(),
                        "watch_time": $(data).find("time_to_watch").text(),
                        "thumbnail": $(data).find("thumbnail").text(),
                        "story_type": $(data).find("story_type").text(),
                        "description": $(data).find("description").text(),
                        "template_type": $(data).find("Type").text(),
                        "path": getLink(this.url),
                        "thImgSel": relThSel
                    };
                    if ($(data).find("link").text()) {
                        story.path = $(data).find("link").text();
                    }
                   
                    storydata.push(story);
                }
            }));
        }
    }
    $.when.apply($, requests).done(function () {
        var merged = storydata;
        merged.unshift(firststory);
        var htmlOutput = template.render(merged);

        $("#related-sidebar").html(htmlOutput);

    });


}