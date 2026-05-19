const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = [
  // ─── Extension (Node.js) ──────────────────────────────────
  {
    name: 'extension',
    target: 'node',
    mode: 'development',
    entry: './src/extension.ts',
    output: {
      filename: 'extension.js',
      path: path.resolve(__dirname, 'dist'),
      libraryTarget: 'commonjs2',
      devtoolModuleFilenameTemplate: '../[resource-path]',
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    resolve: { extensions: ['.ts', '.js'] },
    externals: { vscode: 'commonjs vscode' },
  },

  // ─── Main Panel Webview (React) ────────────────────────────
  {
    name: 'mainPanel',
    target: 'web',
    mode: 'development',
    entry: './src/webview/main.tsx',
    output: {
      filename: 'mainPanel.js',
      path: path.resolve(__dirname, 'dist/webview'),
    },
    plugins: [
      new MiniCssExtractPlugin({ filename: 'mainPanel.css' }),
      // Copy the prebuilt pdf.worker to the webview output so the webview can load it directly
      new CopyWebpackPlugin({
        patterns: [
          {
            // Copy the pdfjs worker into the webview output directory
            from: path.resolve(__dirname, 'node_modules/pdfjs-dist/build/pdf.worker.mjs'),
            to: 'pdf.worker.js',
          },
        ],
      }),
    ],
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        // Emit pdf.worker as a separate asset so react-pdf / pdfjs can load it from the bundle
        {
          test: /pdf\.worker(\.entry)?\.js$/,
          type: 'asset/resource',
          generator: {
            filename: 'pdf.worker.[hash][ext]'
          }
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader'],
        },
      ],
    },
    resolve: { extensions: ['.tsx', '.ts', '.js'] },
  },

  // ─── Sidebar Webview (React) ───────────────────────────────
  {
    name: 'sidebar',
    target: 'web',
    mode: 'development',
    entry: './src/webview/sidebar-main.tsx',
    output: {
      filename: 'sidebar.js',
      path: path.resolve(__dirname, 'dist/webview'),
    },
    plugins: [
      new MiniCssExtractPlugin({ filename: 'sidebar.css' }),
    ],
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader'],
        },
      ],
    },
    resolve: { extensions: ['.tsx', '.ts', '.js'] },
  },
];
