// 
          var script = document.createElement('script');

          var scriptContents = '(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({\'gtm.start\':\r\nnew Date().getTime(),event:\'gtm.js\'});var f=d.getElementsByTagName(s)[0],\r\nj=d.createElement(s),dl=l!=\'dataLayer\'?\'&l=\'+l:\'\';j.async=true;j.src=\r\n\'https:\/\/www.googletagmanager.com\/gtm.js?id=\'+i+dl;f.parentNode.insertBefore(j,f);\r\n})(window,document,\'script\',\'dataLayer\',\'GTM-TBZPN2Z\');';

          script.appendChild(document.createTextNode(scriptContents));

          document.getElementsByTagName('head')[0].appendChild(script);
//
