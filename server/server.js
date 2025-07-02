// server.js (优化版)
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const mammoth = require('mammoth');
const PDFParser = require('pdf-parse');
const Epub = require('epub-gen').default;
const sharp = require('sharp');

const app = express();
const upload = multer({ dest: 'uploads/' });
const port = 3000;

// 静态文件服务
app.use(express.static('public'));

// 处理文件转换请求
app.post('/api/convert', upload.fields([
    { name: 'sourceFile', maxCount: 1 },
    { name: 'coverFile', maxCount: 1 }
]), async (req, res) => {
    try {
        // 验证输入
        if (!req.body.title || !req.body.author || !req.files?.sourceFile) {
            throw new Error('请填写所有必填信息并上传源文件');
        }
        
        const { title, author, inputFormat, outputFormat, chapterPattern, customPattern } = req.body;
        const sourceFile = req.files['sourceFile'][0];
        const coverFile = req.files['coverFile']?.[0];
        
        // 创建唯一的输出文件名
        const outputFileName = `${Date.now()}_${title.replace(/[^a-zA-Z0-9]/g, '_')}.${outputFormat}`;
        const outputPath = path.join(__dirname, 'output', outputFileName);
        
        // 显示进度更新
        const updateProgress = (percent, message) => {
            console.log(`进度: ${percent}% - ${message}`);
        };
        
        updateProgress(10, '开始处理文件...');
        
        // 1. 读取源文件内容
        let content;
        
        switch (inputFormat) {
            case 'txt':
                content = await readTxtFile(sourceFile.path);
                updateProgress(20, '已读取TXT文件内容');
                
                if (outputFormat === 'epub') {
                    const chapterRegex = getChapterRegex(chapterPattern, customPattern);
                    content = splitTxtIntoChapters(content, chapterRegex);
                    updateProgress(30, '已识别章节结构');
                }
                break;
                
            case 'docx':
                content = await convertDocxToText(sourceFile.path);
                updateProgress(30, '已将Word文档转换为文本');
                break;
                
            case 'pdf':
                content = await extractTextFromPdf(sourceFile.path);
                updateProgress(40, '已从PDF中提取文本');
                break;
                
            case 'mobi':
            case 'epub':
                updateProgress(20, `准备转换${inputFormat.toUpperCase()}文件`);
                break;
                
            default:
                throw new Error(`不支持的输入格式: ${inputFormat}`);
        }
        
        // 2. 转换为目标格式
        switch (outputFormat) {
            case 'epub':
                await convertToEpub(content, title, author, coverFile?.path, outputPath);
                updateProgress(80, '已生成EPUB文件');
                break;
                
            case 'mobi':
                await convertToMobi(sourceFile.path, title, author, coverFile?.path, outputPath);
                updateProgress(90, '已生成MOBI文件');
                break;
                
            case 'pdf':
                await convertToPdf(content, title, author, coverFile?.path, outputPath);
                updateProgress(90, '已生成PDF文件');
                break;
                
            default:
                throw new Error(`不支持的输出格式: ${outputFormat}`);
        }
        
        updateProgress(100, '转换完成');
        
        // 3. 返回转换后的文件
        res.setHeader('Content-Disposition', `attachment; filename="${outputFileName}"`);
        res.sendFile(outputPath, (err) => {
            if (err) {
                console.error('发送文件失败:', err);
                res.status(500).send('发送文件失败');
            }
            
            // 清理临时文件
            cleanupFiles([sourceFile.path, coverFile?.path]);
        });
    } catch (error) {
        console.error('转换过程中出错:', error);
        res.status(500).send(`转换失败: ${error.message}`);
        
        // 清理临时文件
        if (req.files) {
            cleanupFiles(Object.values(req.files).flat().map(file => file.path));
        }
    }
});

// 辅助函数 (保持与之前相同)
async function readTxtFile(filePath) {
    return fs.readFile(filePath, 'utf8');
}

async function convertDocxToText(filePath) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
}

async function extractTextFromPdf(filePath) {
    const dataBuffer = await fs.readFile(filePath);
    const data = await PDFParser(dataBuffer);
    return data.text;
}

function getChapterRegex(patternType, customPattern) {
    switch (patternType) {
        case 'default':
            return /^第[一二三四五六七八九十百千0-9]+[章节卷部篇集].*$/gm;
        case 'number':
            return /^\d+\..*$/gm;
        case 'roman':
            return /^第[一二三四五六七八九十百千]+章.*$/gm;
        case 'custom':
            return new RegExp(customPattern, 'gm');
        default:
            return /^第[一二三四五六七八九十百千0-9]+[章节卷部篇集].*$/gm;
    }
}

function splitTxtIntoChapters(content, regex) {
    const chapters = [];
    let currentChapter = { title: '前言', content: '' };
    chapters.push(currentChapter);
    
    const matches = [...content.matchAll(regex)];
    
    matches.forEach((match, index) => {
        const title = match[0].trim();
        const startIndex = match.index;
        let endIndex = content.length;
        
        if (index < matches.length - 1) {
            endIndex = matches[index + 1].index;
        }
        
        const chapterContent = content.substring(startIndex, endIndex);
        currentChapter = { title, content: chapterContent };
        chapters.push(currentChapter);
    });
    
    if (chapters.length === 1 && !chapters[0].content.trim()) {
        chapters[0].title = '正文';
        chapters[0].content = content;
    }
    
    return chapters;
}

async function convertToEpub(content, title, author, coverPath, outputPath) {
    const epubOptions = {
        title,
        author,
        output: outputPath,
        content: []
    };
    
    if (coverPath) {
        epubOptions.cover = coverPath;
    }
    
    if (Array.isArray(content)) {
        content.forEach(chapter => {
            const lines = chapter.content.split('\n');
            lines.shift(); // 移除标题行
            const chapterContent = lines.join('\n');
            
            epubOptions.content.push({
                title: chapter.title,
                data: `<h2>${chapter.title}</h2><p>${chapterContent.replace(/\n/g, '<br>')}</p>`
            });
        });
    } else {
        epubOptions.content.push({
            title: '正文',
            data: `<p>${content.replace(/\n/g, '<br>')}</p>`
        });
    }
    
    return new Promise((resolve, reject) => {
        new Epub(epubOptions, err => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

async function convertToMobi(inputPath, title, author, coverPath, outputPath) {
    return new Promise((resolve, reject) => {
        let command = `ebook-convert "${inputPath}" "${outputPath}" --title "${title}" --author "${author}"`;
        
        if (coverPath) {
            command += ` --cover "${coverPath}"`;
        }
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`执行命令出错: ${error.message}`);
                reject(new Error('MOBI转换失败: ' + stderr));
                return;
            }
            
            if (stderr) {
                console.warn(`命令警告: ${stderr}`);
            }
            
            resolve();
        });
    });
}

async function convertToPdf(content, title, author, coverPath, outputPath) {
    let htmlContent = `
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            <style>
                body { font-family: "SimHei", "WenQuanYi Micro Hei", "Heiti TC", sans-serif; }
                h1 { text-align: center; }
                h2 { page-break-before: always; }
                p { text-indent: 2em; }
            </style>
        </head>
        <body>
            <h1>${title}</h1>
            <p style="text-align: center;">作者: ${author}</p>
    `;
    
    if (coverPath) {
        htmlContent += `<div style="text-align: center; page-break-after: always;">
            <img src="${coverPath}" alt="封面" style="max-width: 80%; max-height: 80vh;" />
        </div>`;
    }
    
    if (Array.isArray(content)) {
        content.forEach(chapter => {
            htmlContent += `<h2>${chapter.title}</h2>`;
            
            const lines = chapter.content.split('\n');
            lines.shift(); // 移除标题行
            
            lines.forEach(line => {
                if (line.trim()) {
                    htmlContent += `<p>${line}</p>`;
                }
            });
        });
    } else {
        const lines = content.split('\n');
        lines.forEach(line => {
            if (line.trim()) {
                htmlContent += `<p>${line}</p>`;
            }
        });
    }
    
    htmlContent += `</body></html>`;
    
    const tempHtmlPath = path.join(__dirname, 'output', `${Date.now()}.html`);
    
    await fs.writeFile(tempHtmlPath, htmlContent, 'utf8');
    
    return new Promise((resolve, reject) => {
        const command = `wkhtmltopdf --encoding utf-8 "${tempHtmlPath}" "${outputPath}"`;
        
        exec(command, (error, stdout, stderr) => {
            // 清理临时HTML文件
            fs.unlink(tempHtmlPath)
                .catch(unlinkErr => console.warn('无法删除临时HTML文件:', unlinkErr));
            
            if (error) {
                console.error(`执行命令出错: ${error.message}`);
                reject(new Error('PDF转换失败: ' + stderr));
                return;
            }
            
            if (stderr) {
                console.warn(`命令警告: ${stderr}`);
            }
            
            resolve();
        });
    });
}

async function cleanupFiles(filePaths) {
    for (const filePath of filePaths) {
        if (filePath) {
            try {
                await fs.unlink(filePath);
            } catch (err) {
                console.warn(`无法删除文件 ${filePath}:`, err);
            }
        }
    }
}

// 启动服务器
app.listen(port, () => {
    console.log(`服务器运行在端口 ${port}`);
});