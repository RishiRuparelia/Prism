importScripts('/scram/scramjet.codecs.js');

self.__scramjet$config = {
  prefix: '/scram/service/',
  codec: self.__scramjet$codecs.plain,
  config: '/scram/scramjet.config.js',
  bundle: '/scram/scramjet.bundle.js',
  worker: '/scram/scramjet.worker.js',
  client: '/scram/scramjet.client.js',
  codecs: '/scram/scramjet.codecs.js',
};

importScripts('/scram/scramjet.worker.js');
