import asyncio
import os
import json
import subprocess
import glob
import edge_tts

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
PUBLIC_VIDEOS = os.path.join(ROOT_DIR, 'apps', 'learning-hub', 'public', 'videos')
GUIDES_JSON = os.path.join(os.path.dirname(__file__), 'guides.json')
LESSONS_VIDEOS_JSON = os.path.join(os.path.dirname(__file__), 'lesson_videos.json')
WORK_DIR = os.path.join(ROOT_DIR, 'apps', 'learning-hub', '.voiceover_build')

VOICES = {
    'es': 'es-MX-DaliaNeural',
    'en': 'en-US-JennyNeural'
}

INTRO_TEMPLATE = {
    'es': 'Bienvenido a Asset Hub Academy. En esta lección aprenderás: {overview}',
    'en': 'Welcome to Asset Hub Academy. In this lesson, you will learn: {overview}'
}

STEP_PREFIX = {
    'es': 'Paso {num}: {title}. {desc} {tip}',
    'en': 'Step {num}: {title}. {desc} {tip}'
}

OUTRO_TEMPLATE = {
    'es': 'Excelente. Has completado esta lección. Ya estás listo para continuar con el siguiente módulo.',
    'en': 'Excellent. You have completed this lesson. You are now ready to continue to the next module.'
}

def get_video_duration(video_path: str) -> float:
    cmd = [
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        video_path
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    return float(res.stdout.strip())

def make_silence(duration: float, output_path: str):
    subprocess.run([
        'ffmpeg', '-y', '-f', 'lavfi',
        '-i', 'anullsrc=r=44100:cl=stereo',
        '-t', f'{duration:.3f}',
        '-q:a', '9',
        '-acodec', 'libmp3lame',
        output_path
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

async def synthesize_clip(text: str, voice: str, output_path: str):
    comm = edge_tts.Communicate(text, voice)
    await comm.save(output_path)

def get_audio_duration(path: str) -> float:
    cmd = [
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        path
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    return float(res.stdout.strip())

async def process_lesson_lang(lesson_id: str, lang: str, video_rel_path: str, guide: dict):
    video_full_path = os.path.join(PUBLIC_VIDEOS, video_rel_path.replace('/', os.sep))
    if not os.path.exists(video_full_path):
        print(f"[{lesson_id}][{lang}] Video not found: {video_full_path}")
        return

    vid_duration = get_video_duration(video_full_path)
    lesson_work = os.path.join(WORK_DIR, f"{lesson_id}_{lang}")
    os.makedirs(lesson_work, exist_ok=True)

    # 1. Prepare spoken texts
    # Intro
    overview_text = guide.get('overview', {}).get(lang, '')
    intro_text = INTRO_TEMPLATE[lang].format(overview=overview_text)
    
    script_segments = [intro_text]
    for step in guide.get('steps', []):
        num = step.get('number', 1)
        title = step.get('title', {}).get(lang, '')
        desc = step.get('description', {}).get(lang, '')
        tip = step.get('tip', {}).get(lang, '')
        if tip:
            tip_text = f"Nota: {tip}" if lang == 'es' else f"Note: {tip}"
        else:
            tip_text = ""
        seg = STEP_PREFIX[lang].format(num=num, title=title, desc=desc, tip=tip_text)
        script_segments.append(seg)
        
    script_segments.append(OUTRO_TEMPLATE[lang])

    # 2. Synthesize all segments
    clip_files = []
    total_speech_duration = 0.0
    for idx, seg_text in enumerate(script_segments):
        clip_path = os.path.join(lesson_work, f"clip_{idx}.mp3")
        await synthesize_clip(seg_text, VOICES[lang], clip_path)
        d = get_audio_duration(clip_path)
        total_speech_duration += d
        clip_files.append((clip_path, d))

    # 3. Calculate silence spacing to fit video duration
    N = len(clip_files)
    remaining_time = vid_duration - total_speech_duration
    
    # We distribute remaining time: initial delay (e.g. 1.5s), between clips, and trailing silence
    if remaining_time < (N * 1.0):
        # Video is quite fast or speech is long; use minimum 1s pauses
        initial_silence = 1.0
        interval_silence = max(0.8, (remaining_time - initial_silence) / max(1, N - 1)) if remaining_time > 1.0 else 0.8
    else:
        initial_silence = 1.5
        slack = remaining_time - initial_silence
        interval_silence = slack / N # distributed between each and at the end

    # 4. Generate silence clips and build concat manifest
    concat_items = []
    
    # Start silence
    start_sil_path = os.path.join(lesson_work, "sil_start.mp3")
    make_silence(max(0.5, initial_silence), start_sil_path)
    concat_items.append(start_sil_path)

    for idx, (c_path, _) in enumerate(clip_files):
        concat_items.append(c_path)
        if idx < len(clip_files) - 1:
            sil_path = os.path.join(lesson_work, f"sil_gap_{idx}.mp3")
            make_silence(max(0.5, interval_silence), sil_path)
            concat_items.append(sil_path)

    # 5. Concat all audio clips
    concat_list_file = os.path.join(lesson_work, "concat_list.txt")
    with open(concat_list_file, 'w', encoding='utf-8') as f:
        for item in concat_items:
            f.write(f"file '{os.path.abspath(item).replace(chr(92), '/')}'\n")

    assembled_audio = os.path.join(lesson_work, "full_narration.mp3")
    subprocess.run([
        'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
        '-i', concat_list_file,
        '-c:a', 'libmp3lame',
        assembled_audio
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # 6. Mux into video
    temp_muxed_video = os.path.join(lesson_work, "muxed.webm")
    # Video duration vs audio: we use -shortest so video stops or audio matches cleanly,
    # or pad audio to video length.
    subprocess.run([
        'ffmpeg', '-y',
        '-i', video_full_path,
        '-i', assembled_audio,
        '-c:v', 'copy',
        '-c:a', 'libopus',
        '-b:a', '128k',
        temp_muxed_video
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Replace original video
    os.replace(temp_muxed_video, video_full_path)
    print(f"[{lesson_id}][{lang}] Successfully added natural voiceover! ({vid_duration:.1f}s)")

async def main():
    with open(GUIDES_JSON, encoding='utf-8') as f:
        guides = json.load(f)
    with open(LESSONS_VIDEOS_JSON, encoding='utf-8') as f:
        lesson_videos = json.load(f)

    print(f"Starting batch narration for {len(lesson_videos)} lessons...")
    for lesson_id, vpaths in lesson_videos.items():
        guide = guides.get(lesson_id, {})
        for lang in ['es', 'en']:
            rel_p = vpaths[lang]
            print(f"Processing {lesson_id} ({lang})...")
            try:
                await process_lesson_lang(lesson_id, lang, rel_p, guide)
            except Exception as e:
                print(f"Error on {lesson_id} [{lang}]: {e}")

    print("\nALL TUTORIAL VIDEOS PROCESSED WITH NATURAL VOICEOVER!")

if __name__ == '__main__':
    asyncio.run(main())
