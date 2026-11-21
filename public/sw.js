importScripts('/src/js/idb.js');
importScripts('/src/js/utility.js');

var CACHE_STATIC_NAME = 'static-v10';
var CACHE_DYNAMIC_NAME = 'dynamic-v10';
var STATIC_FILES = [
  "/",
  "/index.html",
  "/manifest.json",
  "/offline.html",
  "/src/js/app.js",
  "/src/js/feed.js",
  "/src/js/idb.js",
  "/src/js/utility.js",
  "/src/js/material.min.js",
  "/src/css/app.css",
  "/src/css/feed.css",
  "/src/images/dragon.jpg",
  "/src/images/icon-192.png",
  "/src/images/icon-512.png",
  "https://fonts.googleapis.com/css?family=Roboto:400,700",
  "https://fonts.googleapis.com/icon?family=Material+Icons",
  "https://cdnjs.cloudflare.com/ajax/libs/material-design-lite/1.3.0/material.indigo-pink.min.css"
];

self.addEventListener("install", function (event) {
  console.log("[Service Worker] Installing Service Worker ...", event);
  event.waitUntil(
    caches.open(CACHE_STATIC_NAME)
      .then(function (cache) {
        console.log("[Service Worker] Precaching App Shell");
        return Promise.all(
          STATIC_FILES.map(function (url) {
            return cache.add(url).catch(function (err) {
              console.warn('[Service Worker] Could not cache:', url, err);
            });
          })
        );
      })
  );
});

self.addEventListener("activate", function (event) {
  console.log("[Service Worker] Activating Service Worker ....", event);
  event.waitUntil(
    caches.keys()
      .then(function (keyList) {
        return Promise.all(keyList.map(function (key) {
          if (key !== CACHE_STATIC_NAME && key !== CACHE_DYNAMIC_NAME) {
            console.log('[Service Worker] Removing old cache.', key);
            return caches.delete(key);
          }
        }));
      })
  );
  return self.clients.claim();
});

function isInArray(string, array) {
  var cachePath;
  if (string.indexOf(self.origin) === 0) {
    cachePath = string.substring(self.origin.length);
  } else {
    cachePath = string;
  }
  return array.indexOf(cachePath) > -1;
}

function dataURItoBlob(dataURI) {
  var byteString = atob(dataURI.split(',')[1]);
  var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  var ab = new ArrayBuffer(byteString.length);
  var ia = new Uint8Array(ab);
  for (var i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

self.addEventListener('fetch', function (event) {
  var url = 'https://oqcqwwbjjwtlnmyutgzo.supabase.co/rest/v1/posts';

  if (event.request.url.indexOf(url) > -1 && event.request.method === 'GET') {
    event.respondWith(
      fetch(event.request)
        .then(function (res) {
          var clonedRes = res.clone();
          clearAllData('posts')
            .then(function () {
              return clonedRes.json();
            })
            .then(function (data) {
              for (var key in data) {
                writeData('posts', data[key]);
              }
            });
          return res;
        })
        .catch(function () {
          return readAllData('posts').then(function (data) {
            return new Response(JSON.stringify(data), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
  } else if (isInArray(event.request.url, STATIC_FILES)) {
    event.respondWith(
      caches.match(event.request)
    );
  } else if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request)
        .then(function (response) {
          if (response) {
            return response;
          } else {
            return fetch(event.request)
              .then(function (res) {
                return caches.open(CACHE_DYNAMIC_NAME)
                  .then(function (cache) {
                    if (event.request.url.indexOf('http') === 0) {
                      cache.put(event.request.url, res.clone());
                    }
                    return res;
                  });
              })
              .catch(function () {
                return caches.open(CACHE_STATIC_NAME)
                  .then(function (cache) {
                    if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
                      return cache.match('/offline.html');
                    }
                  });
              });
          }
        })
    );
  }
});

self.addEventListener('sync', function (event) {
  console.log('[Service Worker] Background syncing', event);
  if (event.tag === 'sync-new-posts') {
    console.log('[Service Worker] Syncing new Posts');
    event.waitUntil(
      readAllData('sync-posts')
        .then(function (data) {
          for (var dt of data) {
            (function (postItem) {
              var imageUrlPromise;
              var fileName = Date.now() + '_' + (postItem.file_name || 'offline_image.png');

              if (postItem.image_data && postItem.image_data.indexOf('data:') === 0) {
                var blob = dataURItoBlob(postItem.image_data);
                imageUrlPromise = fetch('https://oqcqwwbjjwtlnmyutgzo.supabase.co/storage/v1/object/posts-images/' + fileName, {
                  method: 'POST',
                  headers: {
                    'apikey': 'sb_publishable_Jj6mXio_95u4CFYla9XG9w_c3ssL_1K',
                    'Authorization': 'Bearer sb_publishable_Jj6mXio_95u4CFYla9XG9w_c3ssL_1K',
                    'Content-Type': blob.type || 'image/png'
                  },
                  body: blob
                }).then(function (storageRes) {
                  if (storageRes.ok) {
                    return 'https://oqcqwwbjjwtlnmyutgzo.supabase.co/storage/v1/object/public/posts-images/' + fileName;
                  } else {
                    return '/src/images/dragon.jpg';
                  }
                }).catch(function () {
                  return '/src/images/dragon.jpg';
                });
              } else {
                imageUrlPromise = Promise.resolve(postItem.image_url || postItem.image_data || '/src/images/dragon.jpg');
              }

              imageUrlPromise.then(function (finalImageUrl) {
                var postData = {
                  title: postItem.title,
                  location: postItem.location,
                  image_url: finalImageUrl
                };

                fetch('https://oqcqwwbjjwtlnmyutgzo.supabase.co/rest/v1/posts', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'apikey': 'sb_publishable_Jj6mXio_95u4CFYla9XG9w_c3ssL_1K',
                    'Authorization': 'Bearer sb_publishable_Jj6mXio_95u4CFYla9XG9w_c3ssL_1K',
                    'Prefer': 'return=minimal'
                  },
                  body: JSON.stringify(postData)
                })
                  .then(function (res) {
                    console.log('Sent data to Supabase:', res);
                    if (res.ok) {
                      deleteItemFromData('sync-posts', postItem.id);
                    }
                  })
                  .catch(function (err) {
                    console.log('Error while sending data:', err);
                  });
              });
            })(dt);
          }
        })
    );
  }
});
