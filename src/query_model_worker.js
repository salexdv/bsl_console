import queryModel from './query_model';
import bslMetadata from './bslMetadata';

self.bslMetadata = bslMetadata;

self.onmessage = function (event) {
  let data = event.data || {};

  if (data.type != 'parse')
    return;

  try {
    let document = queryModel.parse(data.text || '');
    delete document.findNodeAt;
    delete document.getContextAt;
    self.postMessage({
      type: 'parsed',
      jobId: data.jobId,
      modelId: data.modelId,
      version: data.version,
      document: document
    });
  }
  catch (error) {
    self.postMessage({
      type: 'error',
      jobId: data.jobId,
      modelId: data.modelId,
      version: data.version,
      message: error && error.message ? error.message : String(error)
    });
  }
};
