@echo off
title Push BLOCKFARE to GitHub (blockbuilderb/blockfare)
cd /d "e:\Users\shoe\ATG_Projects\battlebit-clone"
echo ============================================================================
echo   PUSHING BLOCKFARE TO GITHUB: https://github.com/blockbuilderb/blockfare
echo ============================================================================
echo.
echo If a GitHub Sign-In window pops up, click "Sign in with your browser"!
echo.
git remote set-url origin https://github.com/blockbuilderb/blockfare.git 2>nul || git remote add origin https://github.com/blockbuilderb/blockfare.git
git branch -M main
git push -u origin main
echo.
echo ============================================================================
echo   DONE! Refresh https://github.com/blockbuilderb/blockfare in your browser!
echo ============================================================================
pause
