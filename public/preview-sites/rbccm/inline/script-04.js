$(document).ready(function () {
                // Handle Play episode button click
                $(document).on("click", ".audio-play", function () {

                    var button = this;
                    var targetid = this.getAttribute("data-target");
                    var iframeSrc = podcastData[targetid];
                    console.log(targetid, iframeSrc);

                    if (!iframeSrc) return;

                    // Remove existing player for this target if already present
                    $(".story-podcast-playing").each(function() {
                        var iframe = $(this).find("iframe");
                        iframe.attr("src", ""); // stop audio
                        $(this).remove(); 
                    });

                    // Create the player dynamically
                    var playerDiv = $('<div>', {
                        id: targetid,
                        class: 'story-podcast-playing',
                        role: 'dialog',
                        'aria-label': 'Player'
                    });

                    var closeBtn = $('<button>', {
                        class: 'btn-close-player close-btn',
                        'aria-label': 'Close Player',
                        html: '<img src="/assets/rbccm/images/campaign/player-x.svg" alt="Close" />',
                        click: function () { 
                            playerDiv.remove();
                            $(button).focus(); // Return focus to the button
                        }
                    })

                    // Podcast iframe
                    var iframe = $('<iframe>', {
                        width: '100%',
                        height: '200',
                        scrolling: 'no',
                        frameborder: 'no',
                        allow: 'autoplay',
                        src: iframeSrc
                    })

                    playerDiv.append(closeBtn, iframe);

                    // Insert the player div after the cliked button's parent <p>
                    $(button).after(playerDiv);

                    // Focus th eclose button
                    closeBtn.focus();
                });
            })
