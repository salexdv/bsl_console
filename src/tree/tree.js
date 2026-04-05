class Treeview {
  constructor(treeviewId, editor, imageBase) {
    let self = this;
    this.treeviewId = treeviewId;
    this.editor = editor;
    this.selected = null;
    this.imageBase = imageBase;
    this.clickListener = function(event) {
      self.on("click", event);
    };
    document.querySelector(this.treeviewId).addEventListener("click", this.clickListener);
  }

  on(eventName, eventData) {
    switch (eventName) {
      case "click": {
        if (eventData.target.tagName == "A") {
          eventData.preventDefault();
          let element = eventData.target;
          if (this.editor) {
            let parent = eventData.target.closest("summary");
            let link = {
              variableName: parent.dataset.label,
              variableId: parent.id,
              variablePath: parent.dataset.path,
              label: element.innerText,
              href: element.getAttribute("href")
            };
            this.editor.sendEvent("EVENT_ON_LINK_CLICK", link);
          }
        }
        else if (eventData.target.nodeName == "SUMMARY" && !eventData.target.parentNode.hasAttribute("open")) {
          if (eventData.target.dataset.requested == "false" && !eventData.target.classList.contains("final")) {
            eventData.target.classList.add("loading");
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
          else if (eventData.target.classList.contains("final")) {
            eventData.preventDefault();
          }
        }
        else if (eventData.target.nodeName == "SUMMARY" && eventData.target.parentNode.hasAttribute("open")) {
        }
        else {
          eventData.preventDefault();
        }
        break;
      }
    }
  }

  appendData(data, targetId) {
    let fragment = this.parseData(data);
    if (targetId != null) {
      let target = document.getElementById(targetId);
      if (target && target.parentNode) {
        target.parentNode.appendChild(fragment);
      }
    }
    else {
      let target = document.querySelector(this.treeviewId);
      target.appendChild(fragment);
    }
  }

  replaceData(data, targetId) {
    let fragment = this.parseData(data);
    if (targetId != null) {
      let target = document.getElementById(targetId);
      if (target && target.parentNode) {
        this.replaceNode(target.parentNode, fragment);
        let updatedTarget = document.getElementById(targetId);
        if (updatedTarget) {
          updatedTarget.dataset.requested = true;
        }
      }
    }
    else {
      let target = document.querySelector(this.treeviewId);
      this.replaceChildren(target, fragment);
    }
  }

  parseData(data) {
    let fragment = document.createDocumentFragment();
    Object.keys(data).forEach((key) => {
      fragment.appendChild(this.createDetailsNode(key, data[key]));
    });
    return fragment;
  }

  createDetailsNode(key, item) {
    let details = document.createElement("details");
    let summary = document.createElement("summary");
    let icon = document.createElement("img");

    summary.id = String(key);
    summary.dataset.label = this.getText(item.label);
    summary.dataset.requested = "false";
    summary.dataset.path = this.getText(item.path);
    this.applyClasses(summary, item.class);

    icon.className = "icon";
    icon.src = this.imageBase + this.getIconName(item);
    summary.appendChild(icon);
    summary.appendChild(document.createTextNode(" "));
    this.appendTextOrLink(summary, item.labelLink, item.label);

    if (item.type || item.value || item.valueLink) {
      let equal = document.createElement("span");
      equal.className = "equal";
      equal.textContent = " = ";
      summary.appendChild(document.createTextNode(" "));
      summary.appendChild(equal);
      summary.appendChild(document.createTextNode(" "));
    }
    else {
      summary.appendChild(document.createTextNode(" "));
    }

    if (item.type) {
      let typeNode = document.createElement("span");
      typeNode.className = "type";
      typeNode.textContent = this.getText(item.type);
      summary.appendChild(typeNode);
      summary.appendChild(document.createTextNode(" "));
    }

    if (item.value || item.valueLink) {
      let valueNode = document.createElement("span");
      valueNode.className = "value";
      if (item.valueLink) {
        this.appendTextOrLink(valueNode, item.valueLink, item.value);
      }
      else {
        valueNode.textContent = this.getText(item.value);
      }
      summary.appendChild(valueNode);
    }

    details.appendChild(summary);

    if (item.children) {
      details.appendChild(this.parseData(item.children));
    }

    return details;
  }

  appendTextOrLink(target, linkData, fallbackText) {
    if (linkData && typeof linkData === "object") {
      let anchor = document.createElement("a");
      anchor.href = this.getText(linkData.href);
      anchor.textContent = this.getText(linkData.label || fallbackText);
      target.appendChild(anchor);
      return;
    }

    target.appendChild(document.createTextNode(this.getText(fallbackText)));
  }

  replaceChildren(target, fragment) {
    if (!target) {
      return;
    }

    while (target.firstChild) {
      target.removeChild(target.firstChild);
    }

    target.appendChild(fragment);
  }

  replaceNode(target, replacement) {
    if (!target || !target.parentNode) {
      return;
    }

    target.parentNode.insertBefore(replacement, target);
    target.parentNode.removeChild(target);
  }

  applyClasses(target, className) {
    this.getClassTokens(className).forEach((token) => target.classList.add(token));
  }

  getClassTokens(className) {
    if (typeof className !== "string") {
      return [];
    }

    return className
      .split(/\s+/)
      .filter((token) => /^[a-zA-Z0-9_-]+$/.test(token));
  }

  getIconName(item) {
    let iconName = item.icon ? item.icon : item.children ? "structure.png" : "undefined.png";
    return /^[a-zA-Z0-9._-]+$/.test(iconName) ? iconName : "undefined.png";
  }

  getText(value) {
    return value == null ? "" : String(value);
  }

  open(id) {
    let node = document.getElementById(id);
    if (!node) {
      return;
    }

    while (node.parentNode && node.parentNode.nodeName == "DETAILS") {
      node.classList.remove("loading");
      node = node.parentNode;
      node.setAttribute("open", "true");
    }
  }

  close(id) {
    let summary = document.getElementById(id);
    if (!summary || !summary.parentNode) {
      return;
    }

    let node = summary.parentNode;
    node.removeAttribute("open");
    let detailNodes = node.querySelectorAll("DETAILS");
    detailNodes.forEach((detailNode) => detailNode.removeAttribute("open"));
  }

  select(id) {
    this.open(id);
    let node = document.getElementById(id);
    if (!node) {
      return;
    }

    node.focus();
    node.click();
  }

  dispose() {
    let container = document.querySelector(this.treeviewId);
    container.removeEventListener("click", this.clickListener);
    this.replaceChildren(container, document.createDocumentFragment());
  }
}
