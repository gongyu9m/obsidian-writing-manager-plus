# Writing Manager +

A comprehensive tool for writers to structure, manage, and compile their long-form content.

> ***한국어 문서는 하단에 있습니다.***

## ⚠️ Disclaimer & Call for Contribution

This plugin was created by Google AI Studio. The repository owner is not a developer and cannot provide technical support or maintenance.

**You are free to fork this project, update it, and even submit it to the official community plugin list under your own name.** Any and all contributions from the community are highly encouraged!

## Table of Contents

- [What is this plugin for?](#what-is-this-plugin-for)
- [How to Install (using BRAT)](#how-to-install-using-brat)
- [3-Step Quick Start](#3-step-quick-start)
- [Core Concepts](#core-concepts)
- [Practical Guide](#practical-guide)
- [Settings in Detail](#settings-in-detail)
- [Tips & Use Cases](#tips--use-cases)

## What is this plugin for?

**Writing Manager +** is a powerful tool designed to help you structure scattered ideas and text fragments, manage your writing process, and finally combine (compile) everything into a single, polished manuscript.

This plugin is useful for any creator working on long-form content. It's especially recommended for:

-   **Novelists**: For managing complex plots with multiple chapters and scenes.
-   **Screenwriters**: For structuring and rearranging stories scene by scene.
-   **Academic & Report Writers**: For drafting multiple sections and integrating them into a final document.

## How to Install (using BRAT)

1.  Install the **BRAT** plugin from the Obsidian Community Plugins browser.
2.  Open BRAT's settings (`Settings` -> `Community Plugins` -> `Obsidian42 - BRAT`).
3.  Click "**Add Beta plugin**".
4.  Paste this repository's URL: `https://github.com/gongyu9m/obsidian-writing-manager-plus`
5.  Enable the "Writing Manager +" plugin in Obsidian's community plugin list.

## 3-Step Quick Start

1.  **Set Your Base Project Folder**: Go to **Settings > Default** and select your **`Base Project Folder`**. This is where you'll gather all your writing projects.
2.  **Open the Plugin View**: Click the **'Open Writing Manager +'** icon (a notebook) in the left ribbon menu to open the view.
3.  **Select a Project and Add Entries**: Click on a project folder in the left pane. Now, add entries (markdown notes) to that folder. You'll see them appear in real-time in the right pane.

## Core Concepts

-   **Project**: A **folder**. The 'Folder Tree' in the left pane shows the subfolder structure of your `Base Project Folder`.
-   **Entry**: A single **markdown note** (.md file). It's the smallest building block of your writing.
-   **Folder Representative Note**: A **special note** for a folder's synopsis or settings. It's displayed at the top of the right pane and is excluded from compilation.
-   **Status**: A visual marker indicating the **progress** of each entry (e.g., 'Idea', 'Writing', 'Done').
-   **Metadata and Tagline**: **Additional information** from a note's frontmatter. A field designated as a **'Tagline'** is always displayed below the title, acting like a subtitle.
-   **Compilation**: A feature that **merges multiple entries** into a single markdown file in a set order.

## Practical Guide

-   **Reorder folders/entries**: Drag the handle (the six-dot icon) to reorder items. This order is saved per folder.
-   **Inline metadata editing**: Click on a metadata value to edit it directly. Typing `[[` will activate link autocompletion.
-   **Compile**: Press the **Compile button** (`combine` icon) in the top-right corner. Only entries with the 'Completion Status' will be merged.

## Settings in Detail

-   **Default**: Set your `Base Project Folder`, change the `Pane Layout`, and set the default `Collapse` state for details.
-   **Metadata Display**: Manage which frontmatter fields are displayed. Click the `pin icon` to set a field as a 'Tagline'.
-   **Status**: Create custom work statuses with unique names and colors.
-   **Compilation**: Configure compilation options like including subfolders, setting the `Completion Status`, and the default output path.
-   **Add-ons**: Enable the `Folder Representative Note` feature and define its filename.

## Tips & Use Cases

-   **Use with the `Folder Notes` plugin**: For best compatibility, set the 'Folder Representative Note filename' in **Add-on Settings** to `{{folder_name}}.md`.
-   **Separate Projects**: To manage completely separate workspaces, simply change the `Base Project Folder` in the settings. Your sorting order for the original folder will be safely preserved.

# 옵시디언 집필 매니저 플러스

창작자들이 자신의 긴 글을 구조화하고, 관리하며, 하나의 원고로 컴파일하도록 돕는 도구입니다.

## ⚠️ 면책 조항 및 기여 요청

이 플러그인은 구글 AI 스튜디오가 제작하였습니다. 이 저장소의 소유자는 개발자가 아니므로 기술 지원이나 유지보수를 제공할 수 없습니다.

**누구든지 자유롭게 이 프로젝트를 '포크(fork)'하여 업데이트하고, 자신의 이름으로 옵시디언 정식 커뮤니티 플러그인 목록에 등재할 수 있습니다.** 커뮤니티의 모든 기여를 적극적으로 장려합니다!

## 목차

- [무엇을 위한 플러그인인가요?](#무엇을-위한-플러그인인가요)
- [설치 방법 (BRAT 플러그인 사용)](#설치-방법-brat-플러그인-사용)
- [3단계 빠른 설정](#3단계-빠른-설정)
- [핵심 용어 설명](#핵심-용어-설명)
- [플러그인 활용법: 실용 가이드](#플러그인-활용법-실용-가이드)
- [설정 상세 가이드](#설정-상세-가이드)
- [팁과 활용 사례](#팁과-활용-사례)

## 무엇을 위한 플러그인인가요?

**Writing Manager +**는 흩어져 있는 아이디어와 글 조각들을 체계적으로 구조화하고, 집필 과정을 관리하며, 최종적으로 하나의 완성된 원고로 합치는 모든 과정을 돕는 강력한 도구입니다.

이 플러그인은 긴 글을 쓰는 모든 창작자에게 유용합니다. 특히 다음과 같은 분들께 추천합니다.

-   **소설가**: 여러 챕터와 장면으로 구성된 복잡한 플롯을 관리해야 할 때
-   **시나리오 작가**: 씬(Scene) 단위로 스토리를 구성하고 재배열할 때
-   **논문 및 보고서 저자**: 여러 섹션의 초안을 작성하고 최종본으로 통합할 때

## 설치 방법 (BRAT 플러그인 사용)

1.  옵시디언의 `커뮤니티 플러그인`에서 **BRAT** 플러그인을 찾아 설치합니다.
2.  옵시디언 `설정` -> `커뮤니티 플러그인` -> `Obsidian42 - BRAT` 항목을 클릭하여 BRAT 설정 창을 엽니다.
3.  "**Add Beta plugin**" 버튼을 클릭합니다.
4.  이 저장소의 주소(`https://github.com/gongyu9m/obsidian-writing-manager-plus`)를 붙여넣습니다.
5.  옵시디언 커뮤니티 플러그인 목록에서 "Writing Manager +" 플러그인을 활성화합니다.

## 3단계 빠른 설정

1.  **기본 프로젝트 폴더 설정**: **설정 > 기본**으로 이동하여 **`기본 프로젝트 폴더`**를 선택하세요. 여기에 모든 집필 프로젝트를 모아두게 됩니다.
2.  **플러그인 뷰 열기**: 좌측 리본 메뉴에서 **'집필 매니저 + 열기'** 아이콘(공책 모양)을 클릭하여 뷰를 여세요.
3.  **프로젝트 선택 및 항목 추가**: 좌측 패널에서 작업할 프로젝트 폴더를 클릭하세요. 이제 해당 폴더 안에 항목(마크다운 노트)들을 추가하면 우측 패널에 실시간으로 반영됩니다.

## 핵심 용어 설명

-   **프로젝트**: 일반적인 **폴더**를 의미합니다. 좌측의 '폴더 트리'는 설정된 `기본 프로젝트 폴더`의 하위 폴더 구조를 보여줍니다.
-   **항목**: 하나의 **마크다운 노트**(.md 파일)입니다. 글을 구성하는 가장 작은 단위입니다.
-   **폴더 대표 노트**: 각 폴더의 시놉시스나 설정을 기록하는 **특별한 노트**입니다. 우측 패널 상단에 표시되며, 컴파일 시에는 자동으로 제외됩니다.
-   **상태**: 각 항목의 작업 **진행률**을 나타내는 시각적 표식입니다('아이디어', '집필 중', '완료' 등).
-   **메타데이터와 태그라인**: 노트의 프론트매터에 기록된 **추가 정보**입니다. **'태그라인'**으로 지정된 필드는 항상 제목 아래에 표시되어 부제처럼 활용 가능합니다.
-   **컴파일**: 여러 항목을 설정된 순서에 따라 하나의 마크다운 파일로 **합쳐주는 기능**입니다.

## 플러그인 활용법: 실용 가이드

-   **폴더/항목 순서 변경**: 핸들(점 6개 아이콘)을 드래그하여 순서를 바꿀 수 있습니다. 이 순서는 폴더별로 저장됩니다.
-   **인라인 메타데이터 편집**: 메타데이터 값을 클릭하면 그 자리에서 바로 내용을 수정할 수 있습니다. `[[`를 입력하면 링크 자동완성 기능이 활성화됩니다.
-   **컴파일 실행하기**: 우측 상단의 **컴파일 버튼**(`combine` 아이콘)을 누르세요. '완료 상태'의 항목들만 합쳐집니다.

## 설정 상세 가이드

-   **기본**: `기본 프로젝트 폴더`를 지정하고, `창 레이아웃`을 바꾸며, 상세 정보의 기본 `접기` 상태를 설정합니다.
-   **메타데이터 표시**: 표시할 프론트매터 필드를 관리합니다. `핀 아이콘`을 클릭하여 필드를 '태그라인'으로 지정할 수 있습니다.
-   **상태**: 자신만의 작업 상태를 이름과 색상과 함께 직접 만들 수 있습니다.
-   **컴파일**: 하위 폴더 포함 여부, `완료 상태` 지정, 기본 저장 경로 등 컴파일 옵션을 설정합니다.
-   **부가**: `폴더 대표 노트` 기능을 활성화하고 파일명을 정의합니다.

## 팁과 활용 사례

-   **`Folder Notes` 플러그인과 함께 사용하기**: 최상의 호환성을 위해 **부가 설정**에서 '폴더 대표 노트 파일 이름'을 `{{folder_name}}.md`로 설정하세요.
-   **프로젝트 분리하기**: 작업 공간을 완전히 분리하고 싶다면, 설정에서 `기본 프로젝트 폴더`를 다른 폴더로 변경하여 여러 프로젝트를 개별적으로 관리할 수 있습니다. 원래 폴더의 정렬 순서는 안전하게 보존됩니다.
