require.config({
  baseUrl: '../dist',
  paths:   {
    'bjca': 'bjca.umd.min',
    'jquery': '../demo/jquery-3.3.1.min',
    'dayjs': '../demo/dayjs.min',
  },
});


requirejs(['bjca', 'dayjs', 'jquery'], function(Bjca, dayjs, $) {
  window.$ = $
  window.dayjs = dayjs
  initCA(Bjca.init)
});

