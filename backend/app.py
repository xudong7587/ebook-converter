import os
import uuid
import logging
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from ebooklib import epub
from bs4 import BeautifulSoup
import re
import shutil
from PIL import Image
import io

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # 启用CORS支持

# 配置上传和临时文件目录
UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'output'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

@app.route('/api/convert', methods=['POST'])
def convert_ebook():
    try:
        # 获取表单数据
        title = request.form.get('title')
        author = request.form.get('author')
        chapter_pattern = request.form.get('chapterPattern')
        custom_pattern = request.form.get('customPattern')
        output_format = request.form.get('outputFormat')
        
        # 检查必要参数
        if not title or not author or not output_format:
            return jsonify({'error': '缺少必要参数'}), 400
        
        # 处理源文件
        if 'sourceFile' not in request.files:
            return jsonify({'error': '未上传源文件'}), 400
            
        source_file = request.files['sourceFile']
        if source_file.filename == '':
            return jsonify({'error': '未选择源文件'}), 400
            
        # 生成唯一ID
        file_id = str(uuid.uuid4())
        file_ext = os.path.splitext(source_file.filename)[1].lower()
        
        # 保存源文件
        source_path = os.path.join(UPLOAD_FOLDER, f"{file_id}{file_ext}")
        source_file.save(source_path)
        
        # 处理封面图片（如果有）
        cover_path = None
        if 'coverFile' in request.files:
            cover_file = request.files['coverFile']
            if cover_file.filename != '':
                cover_ext = os.path.splitext(cover_file.filename)[1].lower()
                cover_path = os.path.join(UPLOAD_FOLDER, f"{file_id}_cover{cover_ext}")
                cover_file.save(cover_path)
                
                # 调整封面图片大小（如果需要）
                try:
                    img = Image.open(cover_path)
                    max_size = (800, 1200)
                    img.thumbnail(max_size, Image.LANCZOS)
                    img.save(cover_path)
                except Exception as e:
                    logger.warning(f"调整封面图片大小时出错: {str(e)}")
        
        # 根据输出格式进行转换
        output_path = os.path.join(OUTPUT_FOLDER, f"{file_id}.{output_format}")
        
        if output_format == 'epub':
            if file_ext == '.txt':
                convert_txt_to_epub(source_path, output_path, title, author, chapter_pattern, custom_pattern, cover_path)
            elif file_ext == '.mobi':
                # 这里可以使用Calibre的ebook-convert命令
                convert_mobi_to_epub(source_path, output_path)
            else:
                # 已经是EPUB，直接返回
                shutil.copy(source_path, output_path)
        elif output_format == 'mobi':
            if file_ext == '.txt' or file_ext == '.epub':
                # 使用Calibre的ebook-convert命令
                convert_to_mobi(source_path, output_path, title, author, cover_path)
            else:
                # 已经是MOBI，直接返回
                shutil.copy(source_path, output_path)
        else:
            return jsonify({'error': '不支持的输出格式'}), 400
            
        # 返回转换后的文件
        return send_file(output_path, as_attachment=True, download_name=f"{title}.{output_format}")
        
    except Exception as e:
        logger.error(f"转换过程中出错: {str(e)}")
        return jsonify({'error': f'转换失败: {str(e)}'}), 500
    finally:
        # 清理临时文件
        try:
            if os.path.exists(source_path):
                os.remove(source_path)
            if cover_path and os.path.exists(cover_path):
                os.remove(cover_path)
            if output_path and os.path.exists(output_path) and request.method == 'POST':
                # 只有在成功下载后才删除输出文件
                os.remove(output_path)
        except Exception as e:
            logger.warning(f"清理临时文件时出错: {str(e)}")

def convert_txt_to_epub(txt_path, epub_path, title, author, chapter_pattern, custom_pattern, cover_path=None):
    # 创建新的EPUB书籍
    book = epub.EpubBook()
    
    # 设置元数据
    book.set_identifier(str(uuid.uuid4()))
    book.set_title(title)
    book.set_language('zh-CN')
    book.add_author(author)
    
    # 添加封面（如果有）
    if cover_path:
        with open(cover_path, 'rb') as f:
            cover_content = f.read()
        book.set_cover('cover.jpg', cover_content)
    
    # 读取TXT内容
    with open(txt_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 根据章节模式分割内容
    chapters = split_into_chapters(content, chapter_pattern, custom_pattern)
    
    # 创建章节
    epub_chapters = []
    for i, chapter in enumerate(chapters):
        chapter_title = chapter['title']
        chapter_content = chapter['content']
        
        # 创建HTML内容
        html_content = f'<h1>{chapter_title}</h1><p>{chapter_content}</p>'
        
        # 创建EPUB章节
        epub_ch = epub.EpubHtml(title=chapter_title, file_name=f'chap_{i}.xhtml', lang='zh-CN')
        epub_ch.content = html_content
        
        # 添加到书籍
        book.add_item(epub_ch)
        epub_chapters.append(epub_ch)
    
    # 创建目录
    book.toc = tuple(epub_chapters)
    
    # 添加默认样式
    style = 'body { font-family: Times, serif; }'
    nav_css = epub.EpubItem(uid="style_nav", file_name="style/nav.css", media_type="text/css", content=style)
    book.add_item(nav_css)
    
    # 定义书籍结构
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    
    # 定义书籍 spine
    spine = ['nav'] + epub_chapters
    book.spine = spine
    
    # 保存EPUB文件
    epub.write_epub(epub_path, book)

def split_into_chapters(content, chapter_pattern, custom_pattern):
    """根据指定的章节模式分割文本内容"""
    if chapter_pattern == 'custom':
        regex = custom_pattern
    else:
        # 默认模式
        regex = r'第[一二三四五六七八九十百千0-9]+[章节卷部篇集]'
    
    try:
        # 使用正则表达式分割章节
        chapter_regex = re.compile(regex, re.MULTILINE)
        chapter_positions = [m.start() for m in chapter_regex.finditer(content)]
        
        chapters = []
        for i, pos in enumerate(chapter_positions):
            start = pos
            end = chapter_positions[i+1] if i+1 < len(chapter_positions) else len(content)
            
            chapter_text = content[start:end]
            chapter_title = chapter_regex.search(chapter_text).group(0)
            chapter_content = chapter_text[len(chapter_title):].strip()
            
            chapters.append({
                'title': chapter_title,
                'content': chapter_content.replace('\n', '<br/>')
            })
        
        return chapters
    except Exception as e:
        # 如果分割失败，返回一个包含整个内容的章节
        return [{
            'title': '正文',
            'content': content.replace('\n', '<br/>')
        }]

def convert_mobi_to_epub(mobi_path, epub_path):
    """使用Calibre的ebook-convert工具将MOBI转换为EPUB"""
    os.system(f'ebook-convert "{mobi_path}" "{epub_path}"')

def convert_to_mobi(source_path, mobi_path, title, author, cover_path=None):
    """使用Calibre的ebook-convert工具将源文件转换为MOBI"""
    cmd = f'ebook-convert "{source_path}" "{mobi_path}" --title "{title}" --author "{author}"'
    
    if cover_path:
        cmd += f' --cover "{cover_path}"'
    
    os.system(cmd)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)    