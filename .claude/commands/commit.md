---
allowed-tools: Bash(npm run format:*), Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*)
argument-hint: [optional custom message]
description: Format code and commit all changes with Gitmoji format
---

## Context

- Current git status: !`git status --porcelain`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits for context: !`git log --oneline -5`

## Your task

Based on the above git changes, create a single commit with a Gitmoji-style commit message.

**Gitmoji Guidelines:**

- ✨ `:sparkles:` - New features
- 🐛 `:bug:` - Bug fixes
- 📚 `:books:` - Documentation
- 🎨 `:art:` - Improving code structure/format
- ⚡ `:zap:` - Performance improvements
- 🔒 `:lock:` - Security fixes
- 🔧 `:wrench:` - Configuration changes
- ✅ `:white_check_mark:` - Tests
- 🚀 `:rocket:` - Deployment
- 💄 `:lipstick:` - UI/styling
- 🔥 `:fire:` - Removing code/files
- ♻️ `:recycle:` - Refactoring
- 📦 `:package:` - Dependencies
- 🏗️ `:building_construction:` - Architectural changes

**Instructions:**

1. Format all code with `npm run format` to ensure consistent formatting
2. Stage all changes with `git add .`
3. Analyze the changes and choose the most appropriate Gitmoji
4. Create a commit message with:
   - Title: `emoji description` (if custom message provided as $ARGUMENTS, use: `emoji $ARGUMENTS`)
   - Body: Detailed changelog in keepachangelog format listing specific changes
5. Commit the changes using HEREDOC format

**Commit Message Format:**

```
🎯 title description

## Added
- New features or capabilities

## Changed
- Modified existing functionality

## Fixed
- Bug fixes and corrections

## Removed
- Deleted files or features

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Example:**

```
✨ add user authentication system

## Added
- User registration and login endpoints
- JWT token authentication middleware
- Password hashing with bcrypt
- User session management

## Changed
- Updated API routes to require authentication
- Modified user model schema

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```
