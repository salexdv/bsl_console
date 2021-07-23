const autoprefixer = require('autoprefixer')

module.exports = {
  plugins: [
    autoprefixer({
      overrideBrowserslist: ['ie >= 8', 'last 4 version'],
      extensions: ['.css']
    })
  ]
}
