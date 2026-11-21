var SUPABASE_URL = 'https://oqcqwwbjjwtlnmyutgzo.supabase.co';
var SUPABASE_KEY = 'sb_publishable_Jj6mXio_95u4CFYla9XG9w_c3ssL_1K';

var _supabase = null;
if (window.supabase) {
  _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Elementos DOM
var shareImageButton = document.querySelector('#share-image-button');
var createPostArea = document.querySelector('#create-post');
var closeCreatePostModalButton = document.querySelector('#close-create-post-modal-btn');
var sharedMomentsArea = document.querySelector('#shared-moments');
var form = document.querySelector('form');
var titleInput = document.querySelector('#title');
var locationInput = document.querySelector('#location');
var filePicker = document.querySelector('#filePicker');

// Convertir Data URI (Base64) a Blob para subir a Supabase Storage
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

// Control del Modal
function openCreatePostModal() {
  if (createPostArea) {
    createPostArea.style.display = 'block';
    createPostArea.style.transform = 'translateY(0)';
  }
}

function closeCreatePostModal() {
  if (createPostArea) {
    createPostArea.style.display = 'none';
    createPostArea.style.transform = 'translateY(100vh)';
  }
}

if (shareImageButton) {
  shareImageButton.addEventListener('click', openCreatePostModal);
}
if (closeCreatePostModalButton) {
  closeCreatePostModalButton.addEventListener('click', closeCreatePostModal);
}

// Limpiar tarjetas de la pantalla
function clearCards() {
  if (sharedMomentsArea) {
    while (sharedMomentsArea.hasChildNodes()) {
      sharedMomentsArea.removeChild(sharedMomentsArea.lastChild);
    }
  }
}

// Crear una tarjeta en el Feed
function createCard(data) {
  var cardWrapper = document.createElement('div');
  cardWrapper.className = 'shared-moment-card mdl-card mdl-shadow--2dp';

  var cardTitle = document.createElement('div');
  cardTitle.className = 'mdl-card__title';
  var imageUrl = (data && (data.image_url || data.image_data)) ? (data.image_url || data.image_data) : '/src/images/dragon.jpg';
  cardTitle.style.backgroundImage = 'url("' + imageUrl + '")';
  cardTitle.style.backgroundSize = 'cover';
  cardTitle.style.height = '180px';
  cardWrapper.appendChild(cardTitle);

  var cardTitleTextElement = document.createElement('h2');
  cardTitleTextElement.style.color = 'white';
  cardTitleTextElement.className = 'mdl-card__title-text';
  cardTitleTextElement.textContent = (data && data.title) ? data.title : 'Dragons Club';
  cardTitle.appendChild(cardTitleTextElement);

  var cardSupportingText = document.createElement('div');
  cardSupportingText.className = 'mdl-card__supporting-text';
  cardSupportingText.textContent = (data && data.location) ? data.location : 'In UTEQ';
  cardSupportingText.style.textAlign = 'center';
  cardWrapper.appendChild(cardSupportingText);

  if (window.componentHandler) {
    window.componentHandler.upgradeElement(cardWrapper);
  }

  if (sharedMomentsArea) {
    sharedMomentsArea.appendChild(cardWrapper);
  }
}

// Actualizar la interfaz
function updateUI(posts) {
  clearCards();
  if (posts && posts.length > 0) {
    posts.forEach(function (post) {
      createCard(post);
    });
  } else {
    createCard();
  }
}

var pendingSyncInProgress = false;
var pendingSyncRetryTimer = null;

function loadPosts() {
  if (!_supabase) {
    console.log('Configura tu SUPABASE_URL y SUPABASE_KEY en feed.js');
    clearCards();
    createCard();
    return;
  }

  _supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .then(function (response) {
      if (response.error) {
        console.error('Error al cargar posts desde Supabase:', response.error);
        loadFromIndexedDB();
      } else if (response.data && response.data.length > 0) {
        console.log('Posts cargados desde Supabase (Online):', response.data);
        updateUI(response.data);

        if (typeof clearAllData === 'function' && typeof writeData === 'function') {
          clearAllData('posts').then(function () {
            response.data.forEach(function (post) {
              writeData('posts', post);
            });
          });
        }
      } else {
        updateUI([]);
      }
      syncPendingPosts();
    })
    .catch(function (err) {
      console.warn('Error de conexión a Supabase, intentando IndexedDB offline:', err);
      loadFromIndexedDB();
      syncPendingPosts();
    });
}

function loadFromIndexedDB() {
  if ('indexedDB' in window && typeof readAllData === 'function') {
    readAllData('posts')
      .then(function (data) {
        if (data && data.length > 0) {
          console.log('Posts cargados desde cacheo IndexedDB:', data);
          updateUI(data);
        } else {
          createCard();
        }
      });
  } else {
    createCard();
  }
}

// Cargar posts al iniciar la app
loadPosts();

// ==========================================
// SUBIR IMAGEN Y CREAR POST
// ==========================================
if (form) {
  form.addEventListener('submit', function (event) {
    event.preventDefault();

    if (!titleInput.value.trim() || !locationInput.value.trim()) {
      alert('Por favor, ingresa un título y una ubicación.');
      return;
    }

    if (!_supabase) {
      alert('Debes configurar tu SUPABASE_URL y SUPABASE_KEY en src/js/feed.js primero.');
      return;
    }

    var title = titleInput.value;
    var location = locationInput.value;
    var file = filePicker ? filePicker.files[0] : null;

    if (!navigator.onLine) {
      savePostForBackgroundSync(title, location, file);
      return;
    }

    if (file) {
      var fileName = Date.now() + '_' + file.name;
      _supabase.storage
        .from('posts-images')
        .upload(fileName, file)
        .then(function (uploadResult) {
          if (uploadResult.error) {
            console.error('Error al subir imagen (Online), usando Background Sync:', uploadResult.error);
            savePostForBackgroundSync(title, location, file);
            return;
          }

          var publicUrlData = _supabase.storage
            .from('posts-images')
            .getPublicUrl(fileName);

          var imageUrl = publicUrlData.data.publicUrl;

          savePostToDatabase(title, location, imageUrl);
        })
        .catch(function () {
          savePostForBackgroundSync(title, location, file);
        });
    } else {
      savePostToDatabase(title, location, '/src/images/dragon.jpg');
    }
  });
}

function savePostForBackgroundSync(title, location, file) {
  if (file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var postData = {
        id: new Date().toISOString(),
        title: title,
        location: location,
        image_data: e.target.result,
        file_name: file.name
      };
      storePostAndRegisterSync(postData);
    };
    reader.readAsDataURL(file);
  } else {
    var postData = {
      id: new Date().toISOString(),
      title: title,
      location: location,
      image_data: '/src/images/dragon.jpg'
    };
    storePostAndRegisterSync(postData);
  }
}

function storePostAndRegisterSync(postData) {
  if (typeof writeData === 'function') {
    writeData('sync-posts', postData)
      .then(function () {
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          return navigator.serviceWorker.ready.then(function (sw) {
            return sw.sync.register('sync-new-posts').catch(function (err) {
              console.warn('SyncManager no disponible:', err);
            });
          });
        }
      })
      .then(function () {
        var snackbarContainer = document.querySelector('#confirmation-toast');
        if (snackbarContainer && snackbarContainer.MaterialSnackbar) {
          snackbarContainer.MaterialSnackbar.showSnackbar({
            message: '¡Guardado en sync-posts para sincronizar!'
          });
        } else {
          alert('¡Guardado en sync-posts para sincronizar!');
        }

        closeCreatePostModal();
        titleInput.value = '';
        locationInput.value = '';
        if (filePicker) filePicker.value = '';

        createCard(postData);
        syncPendingPosts();
      })
      .catch(function (err) {
        console.error('Error al guardar en sync-posts:', err);
      });
  }
}

function schedulePendingPostSyncRetry() {
  if (pendingSyncRetryTimer) {
    return;
  }

  pendingSyncRetryTimer = window.setTimeout(function () {
    pendingSyncRetryTimer = null;
    syncPendingPosts();
  }, 5000);
}

function syncPendingPost(post) {
  var imageUrlPromise = Promise.resolve(post.image_url || post.image_data || '/src/images/dragon.jpg');

  if (post.image_data && post.image_data.indexOf('data:') === 0) {
    var blob = dataURItoBlob(post.image_data);
    var fileName = Date.now() + '_' + (post.file_name || 'offline_image.png');

    imageUrlPromise = _supabase.storage
      .from('posts-images')
      .upload(fileName, blob)
      .then(function (uploadResult) {
        if (uploadResult.error) {
          throw uploadResult.error;
        }

        var publicUrlData = _supabase.storage
          .from('posts-images')
          .getPublicUrl(fileName);
        return publicUrlData.data.publicUrl;
      });
  }

  return imageUrlPromise
    .then(function (imageUrl) {
      return _supabase
        .from('posts')
        .insert([{ title: post.title, location: post.location, image_url: imageUrl }]);
    })
    .then(function (insertResult) {
      if (insertResult.error) {
        throw insertResult.error;
      }

      return deleteItemFromData('sync-posts', post.id);
    });
}

function syncPendingPosts() {
  if (pendingSyncInProgress) {
    return;
  }

  if (typeof readAllData !== 'function' || !_supabase) {
    return;
  }

  if (!navigator.onLine) {
    readAllData('sync-posts')
      .then(function (data) {
        if (data && data.length > 0) {
          schedulePendingPostSyncRetry();
        }
      })
      .catch(function (err) {
        console.error('Error al comprobar posts pendientes de sync-posts:', err);
      });
    return;
  }

  pendingSyncInProgress = true;
  var hasSyncFailure = false;
  var hasSyncedPost = false;

  readAllData('sync-posts')
    .then(function (data) {
      if (!data || data.length === 0) {
        return;
      }

      console.log('Sincronizando ' + data.length + ' post(s) pendiente(s) desde sync-posts...');
      return Promise.all(data.map(function (post) {
        return syncPendingPost(post)
          .then(function () {
            hasSyncedPost = true;
            console.log('Post sincronizado exitosamente desde sync-posts:', post);
          })
          .catch(function (err) {
            hasSyncFailure = true;
            console.error('Error al sincronizar post pendiente:', err);
          });
      }));
    })
    .catch(function (err) {
      hasSyncFailure = true;
      console.error('Error al leer posts pendientes de sync-posts:', err);
    })
    .then(function () {
      pendingSyncInProgress = false;

      if (hasSyncFailure) {
        schedulePendingPostSyncRetry();
      } else if (hasSyncedPost) {
        loadPosts();
      }
    });
}

// Sincronizar automáticamente registros de sync-posts cuando vuelva la red
window.addEventListener('online', function () {
  console.log('¡Conexión de red restablecida! Sincronizando datos de sync-posts...');
  if (pendingSyncRetryTimer) {
    window.clearTimeout(pendingSyncRetryTimer);
    pendingSyncRetryTimer = null;
  }
  syncPendingPosts();
});

document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') {
    syncPendingPosts();
  }
});

function savePostToDatabase(title, location, imageUrl) {
  _supabase
    .from('posts')
    .insert([
      { title: title, location: location, image_url: imageUrl }
    ])
    .then(function (insertResult) {
      if (insertResult.error) {
        console.error('Error al insertar post en Supabase, guardando en sync-posts:', insertResult.error);
        savePostForBackgroundSync(title, location, null);
      } else {
        console.log('¡Post guardado exitosamente en Supabase!');

        var snackbarContainer = document.querySelector('#confirmation-toast');
        if (snackbarContainer && snackbarContainer.MaterialSnackbar) {
          snackbarContainer.MaterialSnackbar.showSnackbar({ message: '¡Publicación creada con éxito!' });
        }

        closeCreatePostModal();
        titleInput.value = '';
        locationInput.value = '';
        if (filePicker) filePicker.value = '';

        loadPosts();
      }
    })
    .catch(function (err) {
      console.error('Error de red al insertar post, guardando en sync-posts:', err);
      savePostForBackgroundSync(title, location, null);
    });
}
