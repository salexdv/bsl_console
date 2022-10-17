class Treeview {
  constructor(treeviewId, editor, imageBase) {
    let self = this;
    this.treeviewId = treeviewId;
    this.editor = editor;
    this.selected = null;
    this.imageBase = imageBase;
    this.clickListener = function(event) {
    	self.on("click", event);
    }
    document.querySelector(this.treeviewId).addEventListener("click", this.clickListener);
  };
  on(eventName, eventData) {
    switch (eventName) {      
      case "click": {
      	if (eventData.target.tagName == 'A') {
          eventData.preventDefault();
          let element = eventData.target;
          if (this.editor) {                        
            let parent = eventData.target.closest('summary');
            let link = {
              variableName: parent.dataset.label,
              variableId: parent.id,
              variablePath: parent.dataset.path,
              label: element.innerText,
              href: element.getAttribute('href')
            };
            this.editor.sendEvent("EVENT_ON_LINK_CLICK", link);
          }
        }
        else if (eventData.target.nodeName == 'SUMMARY' && !eventData.target.parentNode.hasAttribute("open")) {
          if (eventData.target.dataset.requested == "false" && !eventData.target.classList.contains('final')) {
            eventData.target.classList.add('loading');
            eventData.preventDefault();
            if (this.editor) {            
              let request = {
                variableName: eventData.target.dataset.label,
                variableId: eventData.target.id,
                variablePath: eventData.target.dataset.path
              };
              this.editor.sendEvent("EVENT_GET_VARIABLE_DATA", request);
            }
            else {
              setTimeout(() => {
                eventData.target.dataset.requested = true;
                this.open(eventData.target.id);
              }, 500);
            }
          }
          else if (eventData.target.classList.contains('final')) {
            eventData.preventDefault();
          }
        }
        else if (eventData.target.nodeName == 'SUMMARY' && eventData.target.parentNode.hasAttribute("open")) {
        }
        else {
            eventData.preventDefault();
        }
        break;
      }
    }   
  }
  appendData(data, targetId) {
    if (targetId != null) {
      let target = document.getElementById(targetId);
      target.parentNode.innerHTML += this.parseData(data)
    }
    else {
      let target = document.querySelector(this.treeviewId);
      target.innerHTML += this.parseData(data);
    }
  };
  replaceData(data, targetId) {
    if (targetId != null) {
      let target = document.getElementById(targetId);
      target.parentNode.outerHTML = this.parseData(data)
      document.getElementById(targetId).dataset.requested = true;
    }
    else {
      let target = document.querySelector(this.treeviewId);
      target.innerHTML = this.parseData(data);
    }
  };
  parseData(data) {
    let me = this;
    let buf = Object.keys(data).map((key) => 
      `<details><summary  id="${key}" data-label="${data[key].label}" data-requested="false" data-path="${data[key].path}" class="${data[key].class}">
      <img class="icon" src="${me.imageBase}${data[key].icon ? data[key].icon : data[key].children ? 'structure.png' : 'undefined.png'}"> </img>
      ${data[key].label} ${data[key].type || data[key].value ? '<span class="equal"> = </span>' : ' '}
      ${Object.keys(data[key]).map((subkey) => {
        return subkey == 'type' || subkey == 'value' ? `<span class="${subkey}">${data[key][subkey]}</span>` : ' ' 
      }).join(' ')}
      </summary>
      ${data[key].children ? me.parseData(data[key].children) : ""}</details>`
    );
    return buf.join("\n")
  };
  open(id) {    
    let node = document.getElementById(id);
    while (node.parentNode.nodeName == "DETAILS") {
      node.classList.remove('loading');
      node = node.parentNode;
      node.setAttribute("open", "true");
    }
  };
  close(id) {
    let node = document.getElementById(id).parentNode;
    node.removeAttribute("open");
    let detailNodes = node.querySelectorAll("DETAILS");
    detailNodes.forEach((node) => node.removeAttribute("open"));
  };
  select(id) {
    this.open(id);
    document.getElementById(id).focus();
    document.getElementById(id).click();
  };
  dispose() {
  	document.querySelector(this.treeviewId).removeEventListener("click", this.clickListener);
  	document.querySelector(this.treeviewId).innerHTML = '';
  };
}