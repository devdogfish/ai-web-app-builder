var invalidDomains = ["@gmail.", "@yahoo.", "@hotmail.", "@live.", "@aol.", "@outlook."];
                  function isEmailGood(email) {
                    for (var i = 0; i < invalidDomains.length; i++) {
                      var domain = invalidDomains[i];
                      if (email.indexOf(domain) != -1) {
                        return false;
                      }
                    }
                    return true;
                  }
      
                  MktoForms2.whenReady(function (form) {
                    $(".mktoForm").width("auto");
      
                    var isSafari = navigator.vendor && navigator.vendor.indexOf('Apple') > -1 &&
                      navigator.userAgent &&
                      navigator.userAgent.indexOf('CriOS') == -1 &&
                      navigator.userAgent.indexOf('FxiOS') == -1;
      
                    if (isSafari) { $("#autofill").hide(); }
                    $("#autofill").detach().prependTo(".mktoCheckboxList").css("text-align", "left").css("margin", "0 0 10px 0");
      
                    form.onValidate(function () {
                      var email = form.vals().Email;
                      if (email) {
                        if (!isEmailGood(email)) {
                          form.submitable(false);
                          var emailElem = form.getFormElem().find("#Email");
                          form.showErrorMessage("Must be Business email.", emailElem);
                        } else {
                          form.submitable(true);
                        }
                      }
                    });
                  });
      
      
                  // config section - customize for your org
                  var config = {
                    instanceHost: "//discover.rbccm.com",
                    munchkinId: "577-RQV-784",
                    formidStack: [1168, 1182],
                    onFinalSuccess: function (vals, thankYouURL) {
                      document.querySelector("#mkto_wrap").innerHTML = "";
                      return false;
                    },
                    insertInsideSelector: "#mkto_wrap"
                    /* insertBeforeSelector : null */
                  }
      
                  /* --- NO NEED TO TOUCH ANYTHING BELOW THIS LINE */
      
                  // utility fns
                  var injectMktoForm = function (parentEl, insertBeforeEl, instanceHost, munchkinId, formid, onReady) {
                    var formEl = document.createElement('FORM');
                    formEl.id = 'mktoForm_' + formid;
                    try {
                      parentEl.insertBefore(formEl, insertBeforeEl)
                    } catch (e) {
                      parentEl.appendChild(formEl)
                    }
      
                    MktoForms2.loadForm.apply(MktoForms2, Array.prototype.slice.apply(arguments, [2]));
                  }
      
                  var ejectElement = function (formEl) {
                    formEl.parentNode.removeChild(formEl);
                  }
      
                  var arrayPushGet = function (ary, pushable) {
                    return ary[ary.push(pushable) - 1];
                  }
      
                  // allow runtime override of starting form ID
                  var startFormId = +document.location.hash.substring(1),
                    startFormIndex = Math.max(config.formidStack.indexOf(startFormId), 0);
      
                  config.formidStack = config.formidStack.slice(startFormIndex);
      
                  // main work
                  var formParentEl = document.querySelector(config.insertInsideSelector) || document.body,
                    formEl = formParentEl.querySelector(config.insertBeforeSelector) || null,
                    formidInitialCount = config.formidStack.length,
                    formElStack = [],
                    formid;
      
                  var nextForm = function (values, thankYouURL) {
                    if (formid = config.formidStack.shift()) {
      
      
                      injectMktoForm(formParentEl, formEl, config.instanceHost, config.munchkinId, formid,
      
                        function (form) {
      
                          if (formEl) {
                            // nothing to eject on initial run
                            $("#sub-pre").html('<h2 style="margin-top: 0;">Thanks for signing up.</h2><p style="color: #002144;">' + values.FirstName + ', look for RBC Capital Markets insights in your inbox soon.</p>');
                            ejectElement(formElStack.shift());
                            form.addHiddenFields({
                              Email: values.Email
                            });
                          }
      
                          formEl = arrayPushGet(formElStack, form.getFormElem()[0]);
                          formParentEl = formEl.parentNode;
      
      
                          form.onSuccess(config.formidStack.length ? nextForm : config.onFinalSuccess);
      
                        });
      
                      // don't forward to ThankYouURL
                      return false;
                    }
                  }
      
                  nextForm(); // first call will initialize
                  $(document).ready(function(){
                    setTimeout(function(){
                      $(".canvas-container .canvas .extras .pagination-buttons button.button").each(function( index ) {
                      $(this).attr('aria-label', 'Pagination Buttons');
                      });
                    }, 3000)
                  })
