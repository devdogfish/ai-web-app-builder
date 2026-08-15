$(document).ready(function () {
        $(".btn-play-audio").click(function (event) {
            event.stopPropagation(); // Prevent the click from propagating to other elements

            // Hide any currently visible podcast players and clear their iframes' src
            $('.story-podcast-playing:visible').each(function () {
                var iframe = $(this).find("iframe");
                iframe.data("src", iframe.attr("src")); // Store the src before resetting it
                iframe.attr("src", "");  // Remove the iframe src to stop audio
                $(this).hide(); // Hide the podcast player
            });

            // Check if the podcast player already exists
            if ($(".podcast-player-wrapper").length > 0) {
                // If the player exists, remove it (close the player)
                $(".podcast-player-wrapper").remove();
            } else {
                // If the player doesn't exist, append it to the bottom of the page
                var podcastIframe = $(".podcast-playing iframe")[0].outerHTML;

                // Set height to 200px
                podcastIframe = podcastIframe.replace(/height="[^"]*"/, 'height="200"'); 

                // Append the iframe
                $("body").append(
                    '<div class="podcast-player-wrapper" style="position:fixed;bottom:0;width:100%;background-color:#f9f9f9;z-index:9999;">' +
                    '<button aria-label="Close Player" style="float: right;" class="btn-close-player"><img src="/assets/rbccm/images/campaign/player-x.svg" alt="Close"></button>' +
                    podcastIframe + '</div>'
                );
            }
        });

        // Event handler to close the podcast player when the close button is clicked
        $(document).on('click', '.btn-close-player', function () {
            $(".podcast-player-wrapper").remove(); // Remove the player when the close button is clicked
        });

        // Event handler to close the podcast player if any other button is clicked
        $(document).on('click', 'button', function (event) {
            // Ignore clicks on the play audio button and the close player button
            if (!$(event.target).hasClass('btn-play-audio') && !$(event.target).hasClass('btn-close-player')) {
                if ($(".podcast-player-wrapper").length > 0) {
                    // Remove the podcast player if it's open
                    $(".podcast-player-wrapper").remove();
                }
            }
        });
    });
