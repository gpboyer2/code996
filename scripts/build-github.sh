#!/usr/bin/env bash

set -euo pipefail

version="${VERSION:-}"

if [ -z "$version" ]
then
    version=$(node -e "console.log(require('./package.json').version)")
fi

if ! command -v gh >/dev/null 2>&1
then
    echo "未找到 gh，无法触发 GitHub Actions。"
    echo "请先安装 GitHub CLI 并登录后重试。"
    exit 1
fi

if ! gh auth status >/dev/null 2>&1
then
    echo "gh 尚未登录，无法触发 GitHub Actions。"
    echo "请先运行 gh auth login。"
    exit 1
fi

branch=$(git branch --show-current)
if [ -z "$branch" ]
then
    echo "当前不在普通分支上，无法确定触发 workflow 的 ref。"
    exit 1
fi

if [ -n "$(git status --porcelain)" ]
then
    echo "当前存在未提交变更，GitHub Actions 只能构建已提交并推送到远端的代码。"
    echo "请先提交当前修改后再运行 npm run build-github。"
    exit 1
fi

git push origin "$branch"
gh workflow run Release --ref "$branch" --field version="$version"

echo "已触发 GitHub Actions 构建：Release"
echo "分支：$branch"
echo "版本：$version"
