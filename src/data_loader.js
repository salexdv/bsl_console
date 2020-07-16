function loadJSON(filename) {

  let xobj = new XMLHttpRequest();
  xobj.overrideMimeType("application/json");
  xobj.open('GET', filename, false);
  xobj.send();

  if (xobj.readyState == 4)
    return JSON.parse(xobj.responseText);
  else
    return null;

}

// Loading main data
bslGlobals = loadJSON('./bslGlobals.json');
bslMetadata = loadJSON('./bslMetadata.json');
snippets = loadJSON('./snippets.json');
