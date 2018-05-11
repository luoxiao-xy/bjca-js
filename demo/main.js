require.config({
  baseUrl: '../dist',
  paths:   {
    'bjca': 'bjca.umd.min',
    'jquery': '../demo/jquery-3.3.1.min',
    'moment': '../demo/moment-with-locales.min',
  },
});


requirejs(['bjca', 'moment', 'jquery'], function(Bjca, moment, $) {
  window.$ = $
  window.moment = moment
  initCA(Bjca.init)
});

