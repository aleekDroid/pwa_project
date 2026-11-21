if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(function () {
      console.log('Service Worker registered!');
    })
    .catch(function (error) {
      console.error('Service Worker registration failed:', error);
    });
} else {
  console.warn('Service Workers no están permitidos en IP no segura. Usa http://localhost:8080 en la barra de direcciones.');
}
