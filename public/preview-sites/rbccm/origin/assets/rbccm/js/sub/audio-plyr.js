document.addEventListener('DOMContentLoaded', () => {
  const audioTitle = $("#hudbay-keypoint-description").text(); 
  const player = Plyr.setup('.js-player', {
    title: audioTitle || 'Audio Player',
    i18n: {
   		menuBack: 'Go back to previous menu, Speed.', 
    }
  });
});

// Complete simplified script - just hide players without clearing iframe sources

$(document).ready(function () {
    
    // When clicking "Watch video" - hide audio players without clearing their sources
    $(document).on("click", ".watch-video-link", function (e) {
        
        // Just hide inline audio player if it's visible
        if ($(".story-podcast-playing:visible").length > 0) {
            console.log("Hiding inline audio player before starting video");
            $(".story-podcast-playing:visible").hide();
            // The iframe source remains intact, audio pauses when hidden
        }
        
        // Remove bottom audio player if it exists
        if ($(".podcast-player-wrapper").length > 0) {
            console.log("Removing bottom audio player before starting video");
            $(".podcast-player-wrapper").remove();
        }
        
        // Let the video's play_video() function handle showing video and hiding header--story
    });
    
    // When clicking "Start Listening" button - close video if it's open
    $(document).on("click", ".audio-play", function (e) {
        
        // Check if video player is open and trigger its close button
        if ($(".page-banner .podcast-playing").length > 0) {
            console.log("Closing video player before starting audio");
            // This will properly restore the header--story banner
            $(".page-banner .podcast-playing .btn-close-player").trigger("click");
        }
        
        // The normal audio player code will show the player with iframe intact
    });
    
    // When clicking bottom audio player button - close video if it's open
    $(document).on("click", ".btn-play-audio", function (e) {
        
        // Check if video player is open and trigger its close button
        if ($(".page-banner .podcast-playing").length > 0) {
            console.log("Closing video player before starting bottom audio");
            // This will properly restore the header--story banner
            $(".page-banner .podcast-playing .btn-close-player").trigger("click");
        }
        
        // The normal audio player code will handle showing the bottom player
    });
    
});

// Console commands for testing:
// 
// Test sequence:
// 1. $(".watch-video-link").click();  // Opens video
// 2. $(".audio-play").click();  // Closes video, opens audio
// 3. $(".watch-video-link").click();  // Hides audio, opens video
// 4. $(".audio-play").click();  // Closes video, shows audio (should still work!)
// 
// Check what's visible:
// console.log("Video:", $(".page-banner .podcast-playing").length > 0);
// console.log("Audio:", $(".story-podcast-playing:visible").length > 0);
// console.log("Header:", $(".header--story:visible").length > 0);