// Monaco Editor Fix Script
// This script helps to properly initialize Monaco Editor and its web workers

(function() {
  console.log('Monaco fix script loaded, attempting to fix editor initialization...');
  
  // Fix worker paths with Blob URLs to avoid cross-origin issues
  window.MonacoEnvironment = {
    getWorkerUrl: function() {
      // Use relative paths that will work on Cloudflare
      return URL.createObjectURL(
        new Blob([
          'self.MonacoEnvironment = { baseUrl: self.location.origin + self.location.pathname.substring(0, self.location.pathname.lastIndexOf("/")) };\n' +
          'self.Worker = undefined;\n' + // Prevent nested worker creation which can cause errors
          'importScripts("./vs/base/worker/workerMain.js");'
        ], { type: 'text/javascript' })
      );
    }
  };
  
  // Check if Monaco failed to load
  window.addEventListener('load', function() {
    setTimeout(function() {
      if (typeof monaco === 'undefined') {
        console.error('Monaco failed to initialize. Attempting recovery...');
        
        // Re-load Monaco scripts
        var script = document.createElement('script');
        script.src = './vs/loader.js';
        script.onload = function() {
          console.log('Monaco loader re-loaded. Initializing editor...');
          
          // Make sure require is defined
          if (typeof require !== 'undefined') {
            // Load Monaco editor main
            require(['vs/editor/editor.main'], function() {
              console.log('Monaco editor main loaded successfully.');
              
              // Load our editor implementation
              require(['editor'], function() {
                console.log('Editor module loaded successfully.');
              });
            });
          } else {
            console.error('Require is not defined after loading loader.js');
          }
        };
        
        document.head.appendChild(script);
      } else {
        console.log('Monaco is available:', typeof monaco);
      }
    }, 1000); // Check after 1 second to allow normal loading to complete
  });
})();
