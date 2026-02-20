// Updated server.js - FIXED VERSION
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5500;
const OLLAMA_HOST = 'localhost';
const OLLAMA_PORT = 11434;

const server = http.createServer((req, res) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    
    // ========== FIXED CORS HEADERS ==========
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, ngrok-skip-browser-warning');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', '*');
    res.setHeader('ngrok-skip-browser-warning', 'true');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    
    // ========== FIXED OLLAMA PROXY ==========
    if (req.url.startsWith('/api/ollama')) {
        // Remove /api/ollama prefix and add /api back
        let targetPath = req.url.replace('/api/ollama', '');
        if (!targetPath.startsWith('/api')) {
            targetPath = '/api' + targetPath;
        }
        
        console.log(`🔁 Proxying: ${targetPath}`);
        
        // Forward the request to Ollama
        const proxyReq = http.request({
            hostname: OLLAMA_HOST,
            port: OLLAMA_PORT,
            path: targetPath,
            method: req.method,
            headers: {
                ...req.headers,
                host: `${OLLAMA_HOST}:${OLLAMA_PORT}`,
                connection: 'keep-alive',
                // Remove CORS headers for Ollama
                'origin': undefined,
                'referer': undefined
            }
        }, (proxyRes) => {
            console.log(`✅ Ollama: ${proxyRes.statusCode} ${targetPath}`);
            
            // Copy Ollama's response headers
            Object.keys(proxyRes.headers).forEach(key => {
                res.setHeader(key, proxyRes.headers[key]);
            });
            
            // Ensure CORS headers are present
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Expose-Headers', '*');
            
            res.writeHead(proxyRes.statusCode);
            proxyRes.pipe(res);
        });
        
        proxyReq.on('error', (err) => {
            console.error('❌ Ollama error:', err.message);
            res.writeHead(502, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': origin
            });
            res.end(JSON.stringify({
                error: 'Ollama Connection Failed',
                message: err.message,
                fix: 'Make sure Ollama is running: ollama serve'
            }));
        });
        
        // Forward request body for POST/PUT
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
            req.pipe(proxyReq);
        } else {
            proxyReq.end();
        }
        
        return;
    }
    
    // ========== HEALTH CHECK (FIXED) ==========
    if (req.url === '/health' || req.url === '/healthz') {
        const healthReq = http.request({
            hostname: OLLAMA_HOST,
            port: OLLAMA_PORT,
            path: '/api/tags',
            method: 'GET',
            timeout: 3000
        }, (ollamaRes) => {
            let data = '';
            ollamaRes.on('data', chunk => data += chunk);
            ollamaRes.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    res.writeHead(200, { 
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': origin
                    });
                    res.end(JSON.stringify({
                        status: 'healthy',
                        server: 'running',
                        ollama: 'connected',
                        models: parsed.models || [],
                        timestamp: new Date().toISOString()
                    }));
                } catch (err) {
                    res.writeHead(200, { 
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': origin
                    });
                    res.end(JSON.stringify({
                        status: 'warning',
                        message: 'Ollama returned invalid JSON'
                    }));
                }
            });
        });
        
        healthReq.on('error', () => {
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': origin
            });
            res.end(JSON.stringify({
                status: 'unhealthy',
                ollama: 'not connected'
            }));
        });
        
        healthReq.end();
        return;
    }
    
    // ========== STATIC FILES ==========
    serveStatic(req, res);
});

function serveStatic(req, res) {
    let filePath = '.' + req.url;
    if (filePath === './') filePath = './index.html';
    
    const ext = path.extname(filePath);
    const contentTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
    };
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // SPA fallback
                fs.readFile('./index.html', (err, html) => {
                    if (err) {
                        res.writeHead(404, { 'Content-Type': 'text/plain' });
                        res.end('404 Not Found');
                    } else {
                        res.writeHead(200, { 
                            'Content-Type': 'text/html',
                            'Access-Control-Allow-Origin': req.headers.origin || '*'
                        });
                        res.end(html);
                    }
                });
            } else {
                res.writeHead(500);
                res.end('Server Error');
            }
        } else {
            res.writeHead(200, { 
                'Content-Type': contentTypes[ext] || 'text/plain',
                'Access-Control-Allow-Origin': req.headers.origin || '*'
            });
            res.end(content);
        }
    });
}

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(60));
    console.log('🚀 AI Proxy Server Running');
    console.log('='.repeat(60));
    console.log(`📍 Local: http://localhost:${PORT}`);
    console.log(`🤖 Ollama Proxy: /api/ollama/* → http://localhost:11434/api/*`);
    console.log(`📊 Health: http://localhost:${PORT}/health`);
    console.log('='.repeat(60));
    console.log('📋 Test with:');
    console.log(`curl http://localhost:${PORT}/api/ollama/tags`);
    console.log('='.repeat(60));
});