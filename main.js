const { app, BrowserWindow, ipcMain } = require('electron/main')
const { dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs').promises
const Database = require('sqlite3')

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  win.loadFile('index.html')
}

app.whenReady().then(() => {
  ipcMain.handle('select-folder', async () => {
    console.log('select-folder IPC handler invoked')
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      })
      console.log('Dialog result:', result)
      return result.filePaths[0] || null
    } catch (error) {
      console.error('Error in select-folder handler:', error)
      return null
    }
  })

  ipcMain.handle('get-directory-tree', async (event, dirPath) => {
    const buildTree = async (dir) => {
      const items = await fs.readdir(dir, { withFileTypes: true })
      const tree = []
      for (const item of items) {
        const fullPath = path.join(dir, item.name)
        if (item.isDirectory()) {
          tree.push({
            name: item.name,
            type: 'directory',
            path: fullPath,
            children: null // Lazy-load children
          })
        } else {
          tree.push({
            name: item.name,
            type: 'file',
            path: fullPath
          })
        }
      }
      return tree
    }
    return await buildTree(dirPath)
  })

  ipcMain.handle('fetch-children', async (event, dirPath) => {
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true })
      const children = []
      for (const item of items) {
        const fullPath = path.join(dirPath, item.name)
        if (item.isDirectory()) {
          children.push({
            name: item.name,
            type: 'directory',
            path: fullPath,
            children: null // Lazy-load children
          })
        } else {
          children.push({
            name: item.name,
            type: 'file',
            path: fullPath
          })
        }
      }
      return children
    } catch (error) {
      console.error('Error fetching children:', error)
      return []
    }
  })

  ipcMain.handle('create-database', async (event, dbPath) => {
    try {
      await fs.mkdir(dbPath, { recursive: true });
      
      const dbFilePath = path.join(dbPath, 'db.sqlite');
      
      console.log('Attempting to create database at:', dbFilePath);
      
      try {
        await fs.access(dbFilePath);
        console.log('Database file already exists');
        return { success: true, path: dbFilePath };
      } catch {
        console.log('Creating new database file');
      }
      
      return new Promise((resolve, reject) => {
        const db = new Database.Database(dbFilePath, (err) => {
          if (err) {
            console.error('Error creating database:', err);
            reject({ success: false, error: err.message });
            return;
          }
          
          db.exec(`
            -- Note Queue table
            CREATE TABLE IF NOT EXISTS note_queue (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              array_name TEXT NOT NULL,
              array_of_notes TEXT, -- JSON string containing array of note IDs
              sr_setting TEXT, -- JSON string for spaced repetition settings
              created_time DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- File table (notes/files)
            CREATE TABLE IF NOT EXISTS file (
              note_id INTEGER PRIMARY KEY AUTOINCREMENT,
              file_path TEXT NOT NULL UNIQUE,
              creation_time DATETIME DEFAULT CURRENT_TIMESTAMP,
              last_revised_time DATETIME,
              review_count INTEGER DEFAULT 0,
              difficulty REAL DEFAULT 0.0, -- Difficulty rating (e.g., 0.0 to 1.0)
              due_time DATETIME
            );

            -- Folder data table
            CREATE TABLE IF NOT EXISTS folder_data (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              folder_path TEXT NOT NULL UNIQUE,
              overall_priority INTEGER DEFAULT 0,
              created_time DATETIME DEFAULT CURRENT_TIMESTAMP
            );
          `, (execErr) => {
            if (execErr) {
              console.error('Error creating table:', execErr);
              db.close();
              reject({ success: false, error: execErr.message });
              return;
            }
            
            console.log('Database table created successfully');

            db.close((closeErr) => {
              if (closeErr) {
                console.error('Error closing database:', closeErr);
                reject({ success: false, error: closeErr.message });
              } else {
                console.log('Database created successfully at:', dbFilePath);
                resolve({ success: true, path: dbFilePath });
              }
            });
          });
        });
      });
      
    } catch (error) {
      console.error('Error in create-database handler:', error);
      return { success: false, error: error.message };
    }
  });

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})