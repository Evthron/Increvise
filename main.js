const { app, BrowserWindow, ipcMain } = require('electron/main')
const { dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs').promises
const Database = require('sqlite3')
const os = require('os')

function getXdgDataHome() {
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
}

function getCentralDbPath() {
  const dataHome = getXdgDataHome()
  return path.join(dataHome, 'increvise', 'central.sqlite')
}

function getIncreviseDataDir() {
  const dataHome = getXdgDataHome()
  return path.join(dataHome, 'increvise')
}

async function initializeCentralDatabase() {
  const increviseDataDir = getIncreviseDataDir()
  const centralDbPath = getCentralDbPath()
  
  await fs.mkdir(increviseDataDir, { recursive: true })
  
  console.log('Central database path:', centralDbPath)
  
  return new Promise((resolve, reject) => {
    const db = new Database.Database(centralDbPath, (err) => {
      if (err) {
        console.error('Error creating central database:', err)
        reject(err)
        return
      }
      
      db.exec(`
        CREATE TABLE IF NOT EXISTS workspace_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          folder_path TEXT NOT NULL UNIQUE,
          folder_name TEXT NOT NULL,
          db_path TEXT NOT NULL,
          first_opened DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_opened DATETIME DEFAULT CURRENT_TIMESTAMP,
          open_count INTEGER DEFAULT 1,
          total_files INTEGER DEFAULT 0,
          files_due_today INTEGER DEFAULT 0
        );
        
        CREATE INDEX IF NOT EXISTS idx_last_opened 
        ON workspace_history(last_opened DESC);
        
        CREATE INDEX IF NOT EXISTS idx_folder_path 
        ON workspace_history(folder_path);
      `, (execErr) => {
        db.close()
        if (execErr) {
          console.error('Error creating tables:', execErr)
          reject(execErr)
        } else {
          console.log('Central database initialized successfully')
          resolve()
        }
      })
    })
  })
}

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

app.whenReady().then(async () => {
  try {
    await initializeCentralDatabase()
    console.log('Central database ready')
  } catch (error) {
    console.error('Failed to initialize central database:', error)
  }
  
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
      const oldDbPath = path.join(dbPath, 'db.sqlite');
      const increviseFolder = path.join(dbPath, '.increvise');
      const dbFilePath = path.join(increviseFolder, 'db.sqlite');
      
      await fs.mkdir(increviseFolder, { recursive: true });
      
      console.log('Attempting to create database at:', dbFilePath);
      
      try {
        await fs.access(oldDbPath);
        console.log('Found old db.sqlite, migrating to .increvise folder');
        await fs.rename(oldDbPath, dbFilePath);
        console.log('Migration complete');
        return { success: true, path: dbFilePath };
      } catch {}
      
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

  // Add file to revision queue
  ipcMain.handle('add-file-to-queue', async (event, filePath, folderPath) => {
    try {
      const dbFilePath = path.join(folderPath, '.increvise', 'db.sqlite');
      
      // Check if database exists
      try {
        await fs.access(dbFilePath);
      } catch {
        return { success: false, error: 'Database not found. Please create a database first.' };
      }
      
      return new Promise((resolve, reject) => {
        const db = new Database.Database(dbFilePath, (err) => {
          if (err) {
            reject({ success: false, error: err.message });
            return;
          }
          
          // Insert file into the file table
          const stmt = db.prepare(`
            INSERT INTO file (file_path, creation_time, review_count, difficulty, due_time)
            VALUES (?, datetime('now'), 0, 0.0, datetime('now'))
            ON CONFLICT(file_path) DO UPDATE SET
              last_revised_time = datetime('now')
          `);
          
          stmt.run([filePath], function(runErr) {
            if (runErr) {
              stmt.finalize();
              db.close();
              reject({ success: false, error: runErr.message });
              return;
            }
            
            const noteId = this.lastID;
            
            // Also record the folder if not exists
            const folderStmt = db.prepare(`
              INSERT OR IGNORE INTO folder_data (folder_path, overall_priority)
              VALUES (?, 0)
            `);
            
            folderStmt.run([folderPath], (folderErr) => {
              folderStmt.finalize();
              stmt.finalize();
              
              db.close((closeErr) => {
                if (closeErr || folderErr) {
                  reject({ success: false, error: (closeErr || folderErr).message });
                } else {
                  resolve({ success: true, noteId, message: 'File added to revision queue' });
                }
              });
            });
          });
        });
      });
    } catch (error) {
      console.error('Error adding file to queue:', error);
      return { success: false, error: error.message };
    }
  });

  // Get files due for revision today
  ipcMain.handle('get-files-for-revision', async (event, rootPath) => {
    try {
      // Find all db.sqlite files in subdirectories
      const findDatabases = async (dir) => {
        const databases = [];
        const items = await fs.readdir(dir, { withFileTypes: true });
        
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          if (item.isDirectory()) {
            if (item.name === '.increvise') {
              const dbFile = path.join(fullPath, 'db.sqlite');
              try {
                await fs.access(dbFile);
                databases.push(dbFile);
              } catch {}
            } else {
              databases.push(...await findDatabases(fullPath));
            }
          }
        }
        return databases;
      };
      
      const dbPaths = await findDatabases(rootPath);
      console.log('Found databases:', dbPaths);
      
      // Aggregate files from all databases
      const allFiles = [];
      
      for (const dbPath of dbPaths) {
        await new Promise((resolve, reject) => {
          const db = new Database.Database(dbPath, Database.OPEN_READONLY, (err) => {
            if (err) {
              console.error('Error opening database:', dbPath, err);
              resolve(); // Continue with other databases
              return;
            }
            
            db.all(`
              SELECT note_id, file_path, creation_time, last_revised_time, 
                     review_count, difficulty, due_time
              FROM file
              WHERE date(due_time) <= date('now')
              ORDER BY due_time ASC
            `, [], (selectErr, rows) => {
              if (selectErr) {
                console.error('Error querying database:', selectErr);
              } else {
                allFiles.push(...rows.map(row => ({ ...row, dbPath })));
              }
              
              db.close(() => resolve());
            });
          });
        });
      }
      
      console.log('Files for revision:', allFiles);
      return { success: true, files: allFiles };
      
    } catch (error) {
      console.error('Error getting files for revision:', error);
      return { success: false, error: error.message, files: [] };
    }
  });

  // Update file after revision (spaced repetition feedback)
  ipcMain.handle('update-revision-feedback', async (event, dbPath, noteId, feedback) => {
    try {
      return new Promise((resolve, reject) => {
        const db = new Database.Database(dbPath, (err) => {
          if (err) {
            reject({ success: false, error: err.message });
            return;
          }
          
          // Calculate next due time based on feedback
          // feedback: 'easy', 'medium', 'hard', 'again'
          const intervals = {
            'again': 0, // Review again today
            'hard': 1,  // 1 day
            'medium': 3, // 3 days
            'easy': 7    // 7 days
          };
          
          const daysToAdd = intervals[feedback] || 1;
          
          // Update difficulty based on feedback
          const difficultyChanges = {
            'again': 0.2,
            'hard': 0.1,
            'medium': 0,
            'easy': -0.1
          };
          
          const difficultyChange = difficultyChanges[feedback] || 0;
          
          const stmt = db.prepare(`
            UPDATE file
            SET last_revised_time = datetime('now'),
                review_count = review_count + 1,
                difficulty = MAX(0.0, MIN(1.0, difficulty + ?)),
                due_time = datetime('now', '+' || ? || ' days')
            WHERE note_id = ?
          `);
          
          stmt.run([difficultyChange, daysToAdd, noteId], function(runErr) {
            stmt.finalize();
            
            db.close((closeErr) => {
              if (runErr || closeErr) {
                reject({ success: false, error: (runErr || closeErr).message });
              } else {
                resolve({ 
                  success: true, 
                  message: `File updated. Next review in ${daysToAdd} day(s)`,
                  changes: this.changes
                });
              }
            });
          });
        });
      });
    } catch (error) {
      console.error('Error updating revision feedback:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return { success: true, content }
    } catch (error) {
      console.error('Error reading file:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('write-file', async (event, filePath, content) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (error) {
      console.error('Error writing file:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('record-workspace', async (event, folderPath) => {
    const centralDbPath = getCentralDbPath()
    const folderName = path.basename(folderPath)
    const dbPath = path.join(folderPath, '.increvise', 'db.sqlite')
    
    return new Promise((resolve, reject) => {
      const db = new Database.Database(centralDbPath, (err) => {
        if (err) {
          reject({ success: false, error: err.message })
          return
        }
        
        db.run(`
          INSERT INTO workspace_history 
          (folder_path, folder_name, db_path, last_opened, open_count)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1)
          ON CONFLICT(folder_path) DO UPDATE SET
            last_opened = CURRENT_TIMESTAMP,
            open_count = open_count + 1
        `, [folderPath, folderName, dbPath], function(runErr) {
          db.close()
          if (runErr) {
            reject({ success: false, error: runErr.message })
          } else {
            console.log('Workspace recorded:', folderPath)
            resolve({ success: true, id: this.lastID })
          }
        })
      })
    })
  })

  ipcMain.handle('get-recent-workspaces', async (event, limit = 10) => {
    const centralDbPath = getCentralDbPath()
    
    return new Promise((resolve, reject) => {
      const db = new Database.Database(centralDbPath, (err) => {
        if (err) {
          reject({ success: false, error: err.message })
          return
        }
        
        db.all(`
          SELECT * FROM workspace_history 
          ORDER BY last_opened DESC 
          LIMIT ?
        `, [limit], (queryErr, rows) => {
          db.close()
          if (queryErr) {
            reject({ success: false, error: queryErr.message })
          } else {
            resolve({ success: true, workspaces: rows || [] })
          }
        })
      })
    })
  })

  ipcMain.handle('update-workspace-stats', async (event, folderPath, totalFiles, filesDueToday) => {
    const centralDbPath = getCentralDbPath()
    
    return new Promise((resolve, reject) => {
      const db = new Database.Database(centralDbPath, (err) => {
        if (err) {
          reject({ success: false, error: err.message })
          return
        }
        
        db.run(`
          UPDATE workspace_history 
          SET total_files = ?, files_due_today = ?
          WHERE folder_path = ?
        `, [totalFiles, filesDueToday, folderPath], function(runErr) {
          db.close()
          if (runErr) {
            reject({ success: false, error: runErr.message })
          } else {
            console.log('Workspace stats updated:', folderPath, totalFiles, filesDueToday)
            resolve({ success: true, changes: this.changes })
          }
        })
      })
    })
  })

  ipcMain.handle('remove-workspace', async (event, folderPath) => {
    const centralDbPath = getCentralDbPath()
    
    return new Promise((resolve, reject) => {
      const db = new Database.Database(centralDbPath, (err) => {
        if (err) {
          reject({ success: false, error: err.message })
          return
        }
        
        db.run(`
          DELETE FROM workspace_history 
          WHERE folder_path = ?
        `, [folderPath], function(runErr) {
          db.close()
          if (runErr) {
            reject({ success: false, error: runErr.message })
          } else {
            console.log('Workspace removed:', folderPath)
            resolve({ success: true, changes: this.changes })
          }
        })
      })
    })
  })

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